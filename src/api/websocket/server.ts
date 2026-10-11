import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'node:http';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { rootLogger } from '../../logging/logger.js';
import { WsClient } from './client.js';

const logger = rootLogger.child('WebSocketServer');

export function setupWebSocketServer(wss: WebSocketServer, runtime: JarvisRuntime): void {
  const clients = new Map<string, WsClient>();

  const onAuthenticated = (deviceId: string, currentClientId: string) => {
    // Terminate any existing duplicate sockets for this device
    for (const [id, client] of clients.entries()) {
      if (id !== currentClientId && client.deviceId === deviceId) {
        logger.warn(`Duplicate WebSocket detected for device ${deviceId}. Terminating old socket ${id}`);
        client.sendError('DUPLICATE_CONNECTION', 'A new connection was established for this device');
        client.close(4009, 'Replaced by new connection');
        clients.delete(id);
      }
    }
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    logger.debug(`New WebSocket connection attempt: ${clientId}`, { ip: req.socket.remoteAddress });

    const client = new WsClient(
      clientId, 
      ws, 
      runtime, 
      () => {
        clients.delete(clientId);
        logger.debug(`WebSocket client removed: ${clientId}`);
      },
      onAuthenticated
    );

    clients.set(clientId, client);
  });

  // Keep-alive interval for all connected clients
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
    logger.info('WebSocket server closed.');
  });
  
  // Forward internal JARVIS events to relevant subscribed clients
  runtime.engine.eventBus.subscribeAll((event) => {
    // Only forward safe events, and only to authorized clients
    const safeEventTypes = [
      'task.created', 'task.updated', 'task.completed', 'task.failed',
      'task:created', 'task:started', 'task:completed', 'task:failed',
      'job.queued', 'job.started', 'job.completed', 'job.failed',
      'approval.created', 'approval.updated', 'approval.requested',
      'approval:requested', 'approval:granted', 'approval:denied', 'approval:expired',
      'security:approval_requested', 'security:approval_granted', 'security:approval_denied',
      'tool:approval_required',
      'automation.started', 'automation.completed', 'automation.failed',
      'notification.created', 'notification.updated',
      'voice.session.updated',
      'voice.session.started',
      'voice.listening',
      'voice.transcript.partial',
      'voice.transcript.final',
      'voice.processing',
      'voice.response',
      'voice.speaking',
      'voice.interrupted',
      'voice.completed',
      'voice.error',
      'voice.session.ended',
      'chat_message'
    ];

    const isVoiceEvent = event.type.startsWith('voice.');
    const isOrchestratorEvent = event.type.startsWith('orchestrator:');
    const isApprovalEvent = event.type.startsWith('approval:') || event.type.startsWith('approval.') || event.type.startsWith('security:approval') || event.type.includes('approval');
    if (!safeEventTypes.includes(event.type) && !isVoiceEvent && !isOrchestratorEvent && !isApprovalEvent) {
      return;
    }

    const channelMap: Record<string, string> = {
      'task': 'tasks',
      'job': 'jobs',
      'approval': 'approvals',
      'security': 'approvals',
      'automation': 'automations',
      'notification': 'notifications',
      'voice': 'voice',
      'chat_message': 'chat',
      'orchestrator': 'orchestrator'
    };

    const prefix = event.type.includes(':') ? event.type.split(':')[0] : event.type.split('.')[0];
    const channel = isApprovalEvent ? 'approvals' : (channelMap[prefix] || channelMap[event.type] || 'orchestrator');

    if (!channel) return;

    // Broadcast to subscribed clients
    for (const client of clients.values()) {
      if (client.isAuthenticated && client.subscriptions.has(channel)) {
        client.sendEvent(event.type, event);
      }
    }
  });
}
