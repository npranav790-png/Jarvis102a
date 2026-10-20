import WebSocket from 'ws';
import {
  IRealtimeVoiceProvider,
  RealtimeAudioChunk,
  VoiceTranscript,
  ProviderOperationalStatus,
  VOICE_ERRORS
} from '../types.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('GeminiLiveProvider');

export interface GeminiLiveOptions {
  apiKey?: string;
  endpointUrl?: string;
  model?: string;
  voiceName?: string;
  systemInstruction?: string;
}

export class GeminiLiveProvider implements IRealtimeVoiceProvider {
  public readonly id = 'gemini-live';
  public readonly name = 'Google Gemini 3.8 Live Streaming';
  public readonly isLocal = false;
  public readonly isPaid = false; // Strictly zero-cost free-tier provider

  private apiKey?: string;
  private endpointUrl?: string;
  private model: string;
  private voiceName: string;
  private systemInstruction: string;
  private ws: WebSocket | null = null;
  private operationalStatus: ProviderOperationalStatus = 'READY';

  private audioCallbacks: Array<(chunk: RealtimeAudioChunk) => void> = [];
  private transcriptCallbacks: Array<(transcript: VoiceTranscript) => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];
  private interruptedCallbacks: Array<() => void> = [];

  constructor(options: GeminiLiveOptions = {}) {
    this.apiKey =
      options.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_AI_API_KEY;
    this.endpointUrl = options.endpointUrl;
    this.model = options.model || 'gemini-3.8-live';
    this.voiceName = options.voiceName || 'Charon';
    this.systemInstruction =
      options.systemInstruction ||
      'You are JARVIS, an autonomous personal AI voice companion. Respond concisely, naturally, and intelligently.';

    if (!this.apiKey && !this.endpointUrl) {
      this.operationalStatus = 'MISCONFIGURED';
      logger.warn('GeminiLiveProvider initialized without GEMINI_API_KEY.');
    }
  }

  public async isAvailable(): Promise<boolean> {
    return (!!this.apiKey || !!this.endpointUrl) && this.operationalStatus === 'READY';
  }

  public getOperationalStatus(): ProviderOperationalStatus {
    return this.operationalStatus;
  }

  public getVoice(): string {
    return this.voiceName;
  }

  public setVoice(voice: string): void {
    this.voiceName = voice;
  }

  public async connect(options?: Record<string, unknown>): Promise<void> {
    if (!this.apiKey && !this.endpointUrl && !options?.url) {
      this.operationalStatus = 'MISCONFIGURED';
      const err = new Error(`${VOICE_ERRORS.INVALID_KEY}: GEMINI_API_KEY is not configured.`);
      this.notifyError(err);
      throw err;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const targetUrl =
      (options?.url as string) ||
      this.endpointUrl ||
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(
        this.apiKey || ''
      )}`;

    return new Promise<void>((resolve, reject) => {
      try {
        const socket = new WebSocket(targetUrl);
        this.ws = socket;

        socket.on('open', () => {
          logger.info(`Gemini Live connected successfully to ${this.model} [Voice: ${this.voiceName}]`);
          this.sendSetupPayload();
          resolve();
        });

        socket.on('message', (data: WebSocket.RawData) => {
          this.handleServerMessage(data);
        });

        socket.on('error', (err: Error) => {
          logger.error(`Gemini Live socket error: ${err.message}`);
          this.notifyError(err);
          reject(err);
        });

        socket.on('close', (code: number, reason: Buffer) => {
          logger.info(`Gemini Live socket closed [${code}]: ${reason.toString('utf-8')}`);
          this.ws = null;
        });
      } catch (err: any) {
        this.notifyError(err);
        reject(err);
      }
    });
  }

  public async disconnect(): Promise<void> {
    if (this.ws) {
      try {
        this.ws.close(1000, 'Normal Closure');
      } catch {
        // Socket may already be closing
      }
      this.ws = null;
    }
  }

  public async sendAudio(chunk: RealtimeAudioChunk): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gemini Live session is not connected.');
    }

    const payload = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: chunk.mimeType || 'audio/pcm;rate=16000',
            data: chunk.data.toString('base64'),
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(payload));
  }

  public async sendText(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gemini Live session is not connected.');
    }

    const payload = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(payload));
  }

  public onAudio(callback: (chunk: RealtimeAudioChunk) => void): void {
    this.audioCallbacks.push(callback);
  }

  public onTranscript(callback: (transcript: VoiceTranscript) => void): void {
    this.transcriptCallbacks.push(callback);
  }

  public onError(callback: (err: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  public onInterrupted(callback: () => void): void {
    this.interruptedCallbacks.push(callback);
  }

  private sendSetupPayload(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const setupPayload = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName,
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.systemInstruction }],
        },
      },
    };

    this.ws.send(JSON.stringify(setupPayload));
  }

  private handleServerMessage(data: WebSocket.RawData): void {
    try {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      const message = JSON.parse(text);

      const serverContent = message.serverContent;
      if (!serverContent) return;

      // Check interruption
      if (serverContent.interrupted) {
        for (const cb of this.interruptedCallbacks) {
          cb();
        }
      }

      // Check transcriptions
      if (serverContent.inputTranscription?.text) {
        const transcript: VoiceTranscript = {
          id: `trans_${Date.now()}_in`,
          voiceSessionId: 'live_session',
          text: serverContent.inputTranscription.text,
          isFinal: true,
          confidence: 0.98,
          provider: this.id,
          createdAt: new Date().toISOString(),
        };
        for (const cb of this.transcriptCallbacks) {
          cb(transcript);
        }
      }

      if (serverContent.outputTranscription?.text) {
        const transcript: VoiceTranscript = {
          id: `trans_${Date.now()}_out`,
          voiceSessionId: 'live_session',
          text: serverContent.outputTranscription.text,
          isFinal: true,
          confidence: 0.99,
          provider: this.id,
          createdAt: new Date().toISOString(),
        };
        for (const cb of this.transcriptCallbacks) {
          cb(transcript);
        }
      }

      // Process model audio turns
      if (serverContent.modelTurn?.parts && Array.isArray(serverContent.modelTurn.parts)) {
        for (const part of serverContent.modelTurn.parts) {
          if (part.inlineData?.data) {
            const audioChunk: RealtimeAudioChunk = {
              data: Buffer.from(part.inlineData.data, 'base64'),
              mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
            };
            for (const cb of this.audioCallbacks) {
              cb(audioChunk);
            }
          }
          if (part.text && !serverContent.outputTranscription?.text) {
            const transcript: VoiceTranscript = {
              id: `trans_${Date.now()}_part`,
              voiceSessionId: 'live_session',
              text: part.text,
              isFinal: !!serverContent.turnComplete,
              confidence: 0.95,
              provider: this.id,
              createdAt: new Date().toISOString(),
            };
            for (const cb of this.transcriptCallbacks) {
              cb(transcript);
            }
          }
        }
      }
    } catch (err: any) {
      logger.error(`Failed to parse Gemini Live message: ${err.message}`);
    }
  }

  private notifyError(err: Error): void {
    for (const cb of this.errorCallbacks) {
      cb(err);
    }
  }
}
