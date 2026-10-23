import { useJarvisStore } from '../store/jarvisStore';
import { voicePlayer } from '../services/voicePlayer';
import { soundEffects } from '../services/soundEffects';

const getInitialApiBase = () => {
  if (typeof window !== 'undefined') {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const queryParams = new URLSearchParams(window.location.search || '');
    const customHost = hashParams.get('host') || queryParams.get('host');
    if (customHost) {
      localStorage.setItem('jarvis_backend_host', customHost);
      return customHost.replace(/\/+$/, '');
    }
    const savedHost = localStorage.getItem('jarvis_backend_host');
    if (savedHost) return savedHost.replace(/\/+$/, '');
    if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `http://${window.location.hostname}:8787/api/v1`;
    }
  }
  return 'http://127.0.0.1:8787/api/v1';
};

const getInitialWsBase = () => {
  if (typeof window !== 'undefined') {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const queryParams = new URLSearchParams(window.location.search || '');
    const customHost = hashParams.get('host') || queryParams.get('host');
    if (customHost) {
      return `${customHost.replace(/^http/, 'ws').replace(/\/+$/, '')}/ws`;
    }
    const savedHost = localStorage.getItem('jarvis_backend_host');
    if (savedHost) {
      return `${savedHost.replace(/^http/, 'ws').replace(/\/+$/, '')}/ws`;
    }
    if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `ws://${window.location.hostname}:8787/api/v1/ws`;
    }
  }
  return 'ws://127.0.0.1:8787/api/v1/ws';
};

let API_BASE = getInitialApiBase();
let WS_BASE = getInitialWsBase();

class ApiClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;

  public setBaseUrl(apiBase: string, wsBase?: string) {
    API_BASE = apiBase.replace(/\/+$/, '');
    WS_BASE = wsBase || `${API_BASE.replace(/^http/, 'ws')}/ws`;
  }

  public getBaseUrl(): string {
    return API_BASE;
  }

  private getHeaders() {
    const customToken = typeof window !== 'undefined' ? localStorage.getItem('jarvis_device_token') : null;
    return {
      'Content-Type': 'application/json',
      'Authorization': customToken ? `Bearer ${customToken}` : 'Bearer dev_token_or_paired_token'
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

  async *streamChat(body: { message: string; sessionId?: string; mode?: string; modelPreference?: 'CLOUD' | 'LOCAL' | 'HYBRID' }): AsyncGenerator<{ delta?: string; done?: boolean; id?: string; content?: string; error?: string }, void, unknown> {
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

  async startPairing() {
    return this.post('/devices/pair/start');
  }

  async completePairing(pairingId: string, code: string, device: { name: string; platform: string; appVersion?: string }) {
    const res = await this.post('/devices/pair/complete', { pairingId, code, device });
    if (res?.accessToken) {
      localStorage.setItem('jarvis_device_token', res.accessToken);
      localStorage.setItem('jarvis_device_id', res.deviceId);
    }
    return res;
  }

  async listDevices() {
    return this.get('/devices');
  }

  async revokeDevice(deviceId: string) {
    return this.post(`/devices/${deviceId}/revoke`);
  }

  async pingDevice(deviceId?: string) {
    return this.post(`/devices/${deviceId || 'self'}/ping`);
  }

  async executeDesktopAction(actionOrData: string | { action: string; [key: string]: any }, params: Record<string, any> = {}) {
    if (typeof actionOrData === 'string') {
      return this.post('/runtime/desktop/action', { action: actionOrData, ...params });
    }
    return this.post('/runtime/desktop/action', actionOrData);
  }

  async captureScreen() {
    return this.post('/runtime/screen');
  }

  // Android Mirroring & App Control
  async getAndroidStatus() {
    return this.get('/android/status');
  }

  async listAndroidDevices() {
    return this.get('/android/devices');
  }

  async connectAndroidWifi(ip: string, port = 5555) {
    return this.post('/android/connect', { ip, port });
  }

  async enableAndroidWireless(serial?: string) {
    return this.post('/android/tcpip', { serial });
  }

  async launchAndroidMirror(options: { serial?: string; fullscreen?: boolean; stayAwake?: boolean; turnScreenOff?: boolean; noAudio?: boolean } = {}) {
    return this.post('/android/launch-mirror', options);
  }

  async sendAndroidInput(data: { key?: string; text?: string; serial?: string }) {
    return this.post('/android/input', data);
  }

  async launchAndroidApp(packageName: string, serial?: string) {
    return this.post('/android/app', { packageName, serial });
  }

  async captureAndroidScreenshot(serial?: string) {
    const query = serial ? `?serial=${encodeURIComponent(serial)}` : '';
    return this.get(`/android/screenshot${query}`);
  }

  async getAndroidTelemetry(serial?: string) {
    const query = serial ? `?serial=${encodeURIComponent(serial)}` : '';
    return this.get(`/android/telemetry${query}`);
  }

  async getAndroidNotifications(serial?: string) {
    const query = serial ? `?serial=${encodeURIComponent(serial)}` : '';
    return this.get(`/android/notifications${query}`);
  }

  async sendAndroidCall(phoneNumber: string, serial?: string) {
    return this.post('/android/call', { phoneNumber, serial });
  }

  async sendAndroidSms(phoneNumber: string, message: string, serial?: string) {
    return this.post('/android/sms', { phoneNumber, message, serial });
  }

  async getModelMode() {
    return this.get('/providers/mode');
  }

  async setModelMode(mode: 'CLOUD' | 'LOCAL' | 'HYBRID', allowFallback = true, preferredModel?: string) {
    return this.post('/providers/mode', { mode, allowFallback, preferredModel });
  }

  async getBriefing() {
    return this.get('/runtime/briefing');
  }

  async captureDesktopScreen(target: 'fullscreen' | 'window' = 'fullscreen') {
    return this.post('/runtime/screen', { target, format: 'png', includeBase64: true });
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
        if (status === 'RUNNING') {
          store.setSystemState('EXECUTING');
        } else if (status === 'FAILED') {
          store.setSystemState('ERROR');
          soundEffects.playAlert();
          setTimeout(() => store.setSystemState('IDLE'), 3000);
        } else if (status === 'COMPLETED') {
          store.setSystemState('VERIFYING');
          soundEffects.playSuccess();
          setTimeout(() => store.setSystemState('IDLE'), 1500);
        }
        
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
        soundEffects.playAlert();
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
        soundEffects.playAlert();
        const promptTitle = payload?.promptTitle || 'the engineered task';
        voicePlayer.speak(`I have analyzed the project and prepared the execution plan for ${promptTitle}. Authorization is required to dispatch OpenCode.`);
        break;
      }
      case 'orchestrator:approved': {
        store.setSystemState('EXECUTING');
        soundEffects.playModeSwitch();
        voicePlayer.speak(`Authorization confirmed. Dispatching task to OpenCode now.`);
        break;
      }
      case 'orchestrator:completed': {
        store.setSystemState('VERIFYING');
        soundEffects.playSuccess();
        voicePlayer.speak(`OpenCode execution has completed successfully. Workspace solution diff is ready for review.`);
        setTimeout(() => store.setSystemState('IDLE'), 2500);
        break;
      }
      case 'orchestrator:failed': {
        store.setSystemState('ERROR');
        soundEffects.playAlert();
        const errText = payload?.error ? `Error: ${payload.error}` : 'OpenCode execution encountered an error.';
        voicePlayer.speak(errText);
        setTimeout(() => store.setSystemState('IDLE'), 3000);
        break;
      }
      case 'chat_message': {
        const chatMsg = payload?.payload ? payload.payload : payload;
        if (chatMsg && (chatMsg.content || chatMsg.text)) {
          const content = chatMsg.content || chatMsg.text || '';
          const existing = store.messages.find(m => m.id === chatMsg.id || (m.role === 'jarvis' && m.content?.trim() === content.trim()));

          store.addMessage({
            id: chatMsg.id || Date.now().toString(),
            role: chatMsg.role || 'jarvis',
            content,
            taskId: chatMsg.taskId,
            timestamp: chatMsg.timestamp || new Date().toISOString()
          });

          if (!existing && (chatMsg.role === 'jarvis' || !chatMsg.role)) {
            voicePlayer.speak(content);
          }
        }
        break;
      }
    }
  }
}

export const api = new ApiClient();
