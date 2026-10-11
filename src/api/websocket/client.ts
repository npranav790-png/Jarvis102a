import { WebSocket } from 'ws';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AuthService } from '../auth/service.js';
import { rootLogger } from '../../logging/logger.js';
import { z } from 'zod';

const logger = rootLogger.child('WsClient');

export class WsClient {
  public isAuthenticated = false;
  public deviceId: string | null = null;
  public subscriptions = new Set<string>();
  private authService: AuthService;

  constructor(
    public readonly id: string,
    private ws: WebSocket,
    private runtime: JarvisRuntime,
    private onCleanup: () => void,
    private onAuthenticated: (deviceId: string, clientId: string) => void
  ) {
    this.authService = new AuthService(runtime);
    
    ws.on('message', this.handleMessage.bind(this));
    ws.on('close', this.handleClose.bind(this));
    ws.on('error', this.handleError.bind(this));
    ws.on('pong', () => { /* Heartbeat acknowledged */ });
  }

  private handleMessage(data: Buffer, isBinary: boolean): void {
    if (isBinary) {
      // Voice streaming could be binary, but for Prompt 6 we expect JSON control messages
      return;
    }

    try {
      const msg = JSON.parse(data.toString());
      this.processCommand(msg);
    } catch (err) {
      this.sendError('INVALID_FORMAT', 'Message must be valid JSON');
    }
  }

  private processCommand(msg: any): void {
    const schema = z.object({
      version: z.number().default(1),
      type: z.literal('command'),
      command: z.string(),
      requestId: z.string().optional(),
      data: z.any().optional()
    });

    const parsed = schema.safeParse(msg);
    if (!parsed.success) {
      this.sendError('INVALID_MESSAGE', 'Message does not match required schema', msg.requestId);
      return;
    }

    const { command, data, requestId } = parsed.data;

    try {
      switch (command) {
        case 'authenticate':
          this.handleAuthenticate(data, requestId);
          break;
        case 'subscribe':
          this.handleSubscribe(data, requestId);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(data, requestId);
          break;
        case 'ping':
          this.sendEvent('pong', {}, requestId);
          break;
        case 'voice.start_session':
          this.handleVoiceStartSession(data, requestId);
          break;
        case 'voice.process_audio':
          this.handleVoiceProcessAudio(data, requestId);
          break;
        case 'voice.cancel':
          this.handleVoiceCancel(data, requestId);
          break;
        default:
          this.sendError('UNKNOWN_COMMAND', `Unknown command: ${command}`, requestId);
      }
    } catch (err) {
      logger.error(`Error processing WS command ${command}`, undefined, err instanceof Error ? err : new Error(String(err)));
      this.sendError('INTERNAL_ERROR', 'An internal error occurred while processing command', requestId);
    }
  }

  private handleAuthenticate(data: any, requestId?: string): void {
    const schema = z.object({ token: z.string() });
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      this.sendError('UNAUTHORIZED', 'Missing or invalid token', requestId);
      return;
    }

    try {
      const payload = this.authService.verifyToken(parsed.data.token, 'access');
      const device = this.authService.getDevice(payload.dev);
      
      if (!device || device.revokedAt) {
        throw new Error('Device revoked or not found');
      }

      this.isAuthenticated = true;
      this.deviceId = device.id;
      this.authService.updateLastSeen(this.deviceId);

      logger.debug(`WS client ${this.id} authenticated as device ${this.deviceId}`);
      this.sendEvent('authenticated', { deviceId: this.deviceId }, requestId);
      
      // Notify server so duplicate connections can be closed
      this.onAuthenticated(this.deviceId, this.id);
    } catch (err) {
      this.sendError('UNAUTHORIZED', 'Authentication failed', requestId);
      this.ws.close(4001, 'Unauthorized');
    }
  }

  private handleSubscribe(data: any, requestId?: string): void {
    if (!this.isAuthenticated) {
      this.sendError('UNAUTHORIZED', 'Must authenticate before subscribing', requestId);
      return;
    }

    const schema = z.object({ channels: z.array(z.string()) });
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      this.sendError('INVALID_DATA', 'Missing channels array', requestId);
      return;
    }

    for (const channel of parsed.data.channels) {
      this.subscriptions.add(channel);
    }

    this.sendEvent('subscribed', { channels: Array.from(this.subscriptions) }, requestId);
  }

  private handleUnsubscribe(data: any, requestId?: string): void {
    if (!this.isAuthenticated) return;

    const schema = z.object({ channels: z.array(z.string()) });
    const parsed = schema.safeParse(data);
    if (!parsed.success) return;

    for (const channel of parsed.data.channels) {
      this.subscriptions.delete(channel);
    }

    this.sendEvent('unsubscribed', { channels: Array.from(this.subscriptions) }, requestId);
  }

  private async handleVoiceStartSession(data: any, requestId?: string): Promise<void> {
    if (!this.isAuthenticated) {
      this.sendError('UNAUTHORIZED', 'Must authenticate before starting voice session', requestId);
      return;
    }
    try {
      const session = await this.runtime.voiceService.createSession(data || {});
      this.sendEvent('voice.session_created', { voiceSessionId: session.id, session }, requestId);
    } catch (err: any) {
      this.sendError('VOICE_ERROR', err.message || 'Failed to start voice session', requestId);
    }
  }

  private async handleVoiceProcessAudio(data: any, requestId?: string): Promise<void> {
    if (!this.isAuthenticated) {
      this.sendError('UNAUTHORIZED', 'Must authenticate before sending voice audio', requestId);
      return;
    }
    try {
      const schema = z.object({
        sessionId: z.string(),
        audioBase64: z.string(),
        mimeType: z.string().default('audio/wav')
      });
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        this.sendError('INVALID_DATA', 'Missing required sessionId or audioBase64', requestId);
        return;
      }

      const buffer = Buffer.from(parsed.data.audioBase64, 'base64');
      const result = await this.runtime.voiceService.processAudio(parsed.data.sessionId, {
        buffer,
        mimeType: parsed.data.mimeType
      });

      this.sendEvent('voice.processed', {
        sessionId: result.sessionId,
        transcript: result.transcript,
        response: result.response,
        audioBase64: result.audio?.buffer ? result.audio.buffer.toString('base64') : undefined,
        mimeType: result.audio?.mimeType || 'audio/wav',
        timingMs: result.timingMs,
      }, requestId);
    } catch (err: any) {
      this.sendError('VOICE_ERROR', err.message || 'Voice audio processing failed', requestId);
    }
  }

  private async handleVoiceCancel(data: any, requestId?: string): Promise<void> {
    if (!this.isAuthenticated) return;
    try {
      if (data?.sessionId) {
        await this.runtime.voiceService.cancelSession(data.sessionId);
        this.sendEvent('voice.cancelled', { sessionId: data.sessionId }, requestId);
      }
    } catch (err: any) {
      this.sendError('VOICE_ERROR', err.message || 'Failed to cancel voice session', requestId);
    }
  }

  public sendEvent(event: string, data: any, requestId?: string): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    const payload = {
      version: 1,
      type: 'event',
      event,
      requestId,
      timestamp: new Date().toISOString(),
      data
    };

    this.ws.send(JSON.stringify(payload));
  }

  public sendError(code: string, message: string, requestId?: string): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    const payload = {
      version: 1,
      type: 'error',
      error: {
        code,
        message,
        requestId
      }
    };

    this.ws.send(JSON.stringify(payload));
  }
  
  public close(code?: number, reason?: string): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(code, reason);
    }
  }

  private handleClose(): void {
    logger.debug(`WS client ${this.id} closed`);
    this.onCleanup();
  }

  private handleError(err: Error): void {
    logger.error(`WS client ${this.id} error`, undefined, err);
    this.onCleanup();
  }
}
