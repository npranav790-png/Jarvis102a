import { useJarvisStore } from '../store/jarvisStore';
import { voicePlayer } from '../services/voicePlayer';

const API_BASE = 'http://127.0.0.1:8787/api/v1';
const WS_BASE = 'ws://127.0.0.1:8787/api/v1/ws';

class ApiClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  // implement the full pair flow. We'll include the header just in case.
  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer dev_token_or_paired_token'
    };
  }

  private visibilityAttached = false;

  async get(path: string) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: this.getHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (e) {
      console.error(`GET ${path} failed:`, e);
      return null;
    }
  }

  async post(path: string, body: any = {}) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (e) {
      console.error(`POST ${path} failed:`, e);
      throw e;
    }
  }

  async delete(path: string) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      if (!res.ok) throw new Error(await res.text());
      return res.status === 204 ? null : await res.json();
    } catch (e) {
      console.error(`DELETE ${path} failed:`, e);
      throw e;
    }
  }

  async *streamChat(body: { message: string; sessionId?: string; mode?: string }): AsyncGenerator<{ delta?: string; done?: boolean; id?: string; content?: string; error?: string }, void, unknown> {
    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `Stream request failed with status ${res.status}`);
    }
    if (!res.body) {
      throw new Error('Response body is null');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          yield parsed;
        } catch {
          // Ignore parse errors on split chunks
        }
      }
    }
  }

  connectWs() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (typeof window !== 'undefined' && !this.visibilityAttached) {
      this.visibilityAttached = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            this.connectWs();
          }
        }
      });
    }
    
    this.ws = new WebSocket(`${WS_BASE}?token=dev_token_or_paired_token`);
    
    this.ws.onopen = () => {
      console.log('WS Connected, authenticating...');
      this.ws?.send(JSON.stringify({
        version: 1,
        type: 'command',
        command: 'authenticate',
        data: { token: 'dev_token_or_paired_token' }
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'error') {
          console.error('WS Error:', msg.error);
          return;
        }
        if (msg.type === 'event' && msg.event === 'authenticated') {
          console.log('WS Authenticated');
          useJarvisStore.getState().setWsConnected(true);
          useJarvisStore.getState().setSystemState('IDLE');
          this.ws?.send(JSON.stringify({
            version: 1,
            type: 'command',
            command: 'subscribe',
            data: { channels: ['tasks', 'approvals', 'system', 'chat', 'orchestrator'] }
          }));
          return;
        }
        if (msg.type === 'event') {
          this.handleWsEvent(msg);
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log('WS Disconnected, code:', event?.code, 'reason:', event?.reason);
      useJarvisStore.getState().setWsConnected(false);
      useJarvisStore.getState().setSystemState('OFFLINE');
      this.ws = null;
      
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      
      // If code is 4009, connection was closed because a duplicate connection for this device was established.
      // Do NOT immediately reconnect to avoid fighting the active tab in an infinite loop!
      if (event?.code === 4009) {
        console.warn('WebSocket superseded by another session. Will reconnect when this tab is refocused.');
        return;
      }

      // Reconnect with jitter
      this.reconnectTimer = setTimeout(() => {
        this.connectWs();
      }, 2000 + Math.random() * 2000);
    };
  }

  private wsListeners = new Set<(event: string, data: any) => void>();

  public onWsEvent(listener: (event: string, data: any) => void): () => void {
    this.wsListeners.add(listener);
    return () => this.wsListeners.delete(listener);
  }

  private handleWsEvent(msg: any) {
    const store = useJarvisStore.getState();
    const eventType = msg.event;
    const payload = msg.data || msg.payload;

    // Dispatch to registered components
    this.wsListeners.forEach((listener) => {
      try {
        listener(eventType, payload);
      } catch (err) {
        console.error('Error in WS listener:', err);
      }
    });

    switch (eventType) {
      case 'system_state':
        if (payload?.state) store.setSystemState(payload.state);
        break;
      case 'task.created':
      case 'task.updated':
      case 'task.completed':
      case 'task.failed': {
        const taskPayload = payload?.payload || payload;
        const status = taskPayload?.status;
        if (status === 'RUNNING') store.setSystemState('EXECUTING');
        else if (status === 'FAILED') { store.setSystemState('ERROR'); setTimeout(() => store.setSystemState('IDLE'), 3000); }
        else if (status === 'COMPLETED') { store.setSystemState('VERIFYING'); setTimeout(() => store.setSystemState('IDLE'), 1500); }
        
        this.get('/tasks').then(res => {
          if (res?.data && Array.isArray(res.data)) store.setActiveTasks(res.data);
          else if (Array.isArray(res)) store.setActiveTasks(res);
        });
        break;
      }
      case 'approval.created':
      case 'approval.requested':
      case 'approval:requested':
      case 'security:approval_requested':
      case 'tool:approval_required': {
        store.setSystemState('WAITING');
        const reason = payload?.reason || payload?.action || 'An operation requires your approval.';
        voicePlayer.speak(`Authorization required: ${reason}. Please approve or reject.`);
        this.get('/approvals').then(res => {
          if (res?.data && Array.isArray(res.data)) store.setPendingApprovals(res.data);
          else if (Array.isArray(res)) store.setPendingApprovals(res);
        });
        break;
      }
      case 'orchestrator:awaiting_approval': {
        store.setSystemState('WAITING');
        const promptTitle = payload?.promptTitle || 'the engineered task';
        voicePlayer.speak(`I have analyzed the project and prepared the execution plan for ${promptTitle}. Authorization is required to dispatch OpenCode.`);
        break;
      }
      case 'orchestrator:approved': {
        store.setSystemState('EXECUTING');
        voicePlayer.speak(`Authorization confirmed. Dispatching task to OpenCode now.`);
        break;
      }
      case 'orchestrator:completed': {
        store.setSystemState('VERIFYING');
        voicePlayer.speak(`OpenCode execution has completed successfully. Workspace solution diff is ready for review.`);
        setTimeout(() => store.setSystemState('IDLE'), 2500);
        break;
      }
      case 'orchestrator:failed': {
        store.setSystemState('ERROR');
        const errText = payload?.error ? `Error: ${payload.error}` : 'OpenCode execution encountered an error.';
        voicePlayer.speak(errText);
        setTimeout(() => store.setSystemState('IDLE'), 3000);
        break;
      }
      case 'chat_message': {
        const chatMsg = payload?.payload ? payload.payload : payload;
        if (chatMsg && (chatMsg.content || chatMsg.text)) {
          const content = chatMsg.content || chatMsg.text || '';
          store.addMessage({
            id: chatMsg.id || Date.now().toString(),
            role: chatMsg.role || 'jarvis',
            content,
            taskId: chatMsg.taskId,
            timestamp: chatMsg.timestamp || new Date().toISOString()
          });

          if (chatMsg.role === 'jarvis' || !chatMsg.role) {
            voicePlayer.speak(content);
          }
        }
        break;
      }
    }
  }
}

export const api = new ApiClient();
