import crypto from 'node:crypto';
import { SpeechToTextProvider, AudioInput, VoiceTranscript, ProviderOperationalStatus, VOICE_ERRORS } from '../types.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('GeminiSTTProvider');

export interface GeminiSTTProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
}

export class GeminiSTTProvider implements SpeechToTextProvider {
  public readonly id = 'gemini-stt';
  public readonly name = 'Google Gemini Cloud STT';
  public readonly isLocal = false;
  public readonly isPaid = false; // Strictly zero-cost free tier

  private apiKey?: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;
  private maxRetries: number;
  private initialDelayMs: number;
  private operationalStatus: ProviderOperationalStatus = 'READY';
  private rateLimitUntil?: Date;

  constructor(options: GeminiSTTProviderOptions = {}) {
    this.apiKey =
      options.apiKey !== undefined
        ? options.apiKey
        : (process.env.GEMINI_API_KEY ||
           process.env.GOOGLE_API_KEY ||
           process.env.GOOGLE_AI_API_KEY);

    this.baseUrl = (
      options.baseUrl ||
      process.env.GEMINI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/+$/, '');

    // Default to fast, low-latency Gemini Flash model
    this.model = options.model || process.env.GEMINI_STT_MODEL || 'gemini-2.5-flash';
    this.timeoutMs = options.timeoutMs ?? 25000;
    this.maxRetries = options.maxRetries ?? 2;
    this.initialDelayMs = options.initialDelayMs ?? 1000;

    if (!this.apiKey) {
      this.operationalStatus = 'MISCONFIGURED';
    }
  }

  public getModel(): string {
    return this.model;
  }

  public getOperationalStatus(): ProviderOperationalStatus {
    return this.operationalStatus;
  }

  public async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    if (this.rateLimitUntil && new Date() < this.rateLimitUntil) return false;
    return this.operationalStatus !== 'MISCONFIGURED';
  }

  public async transcribe(audio: AudioInput): Promise<VoiceTranscript> {
    if (!audio.buffer || audio.buffer.length === 0) {
      return {
        id: `vt_${crypto.randomUUID().slice(0, 8)}`,
        voiceSessionId: '',
        text: '',
        isFinal: true,
        confidence: 0,
        provider: this.id,
        createdAt: new Date().toISOString(),
      };
    }

    if (!this.apiKey) {
      this.operationalStatus = 'MISCONFIGURED';
      const err: any = new Error('Gemini API key is missing or not configured');
      err.code = VOICE_ERRORS.INVALID_KEY;
      throw err;
    }

    if (this.rateLimitUntil && new Date() < this.rateLimitUntil) {
      const err: any = new Error(`Gemini STT rate limited until ${this.rateLimitUntil.toISOString()}`);
      err.code = VOICE_ERRORS.QUOTA_EXHAUSTED;
      throw err;
    }

    const mimeType = audio.mimeType || 'audio/wav';
    const base64Audio = audio.buffer.toString('base64');

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: 'Transcribe the spoken words in this audio exactly as uttered. Return ONLY the verbatim transcript text. If there is no speech or only silence/background noise, return an empty string. Do not include quotes, notes, or markdown formatting.',
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 512,
      },
    };

    const endpoint = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data: any = await response.json();
          const candidateText =
            data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

          return {
            id: `vt_${crypto.randomUUID().slice(0, 8)}`,
            voiceSessionId: '',
            text: candidateText,
            isFinal: true,
            confidence: 0.95,
            provider: this.id,
            createdAt: new Date().toISOString(),
          };
        }

        // Handle error responses
        if (response.status === 401 || response.status === 403) {
          this.operationalStatus = 'MISCONFIGURED';
          const err: any = new Error('Invalid Gemini API key for STT transcription');
          err.code = VOICE_ERRORS.INVALID_KEY;
          throw err;
        }

        if (response.status === 429) {
          this.operationalStatus = 'RATE_LIMITED';
          this.rateLimitUntil = new Date(Date.now() + 60000);
          const err: any = new Error('Gemini free-tier STT rate limit reached');
          err.code = VOICE_ERRORS.QUOTA_EXHAUSTED;
          throw err;
        }

        const errText = await response.text().catch(() => '');
        throw new Error(`Gemini STT returned HTTP ${response.status}: ${errText.slice(0, 100)}`);
      } catch (err: any) {
        lastError = err;
        if (err.code === VOICE_ERRORS.INVALID_KEY || err.code === VOICE_ERRORS.QUOTA_EXHAUSTED) {
          throw err;
        }

        if (attempt <= this.maxRetries) {
          const delay = this.initialDelayMs * Math.pow(2, attempt - 1);
          logger.warn(`Gemini STT attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.error('Gemini STT transcription failed after retries', undefined, lastError || undefined);
    const err: any = lastError || new Error('Gemini STT transcription failed');
    err.code = err.code || VOICE_ERRORS.PROVIDER_UNAVAILABLE;
    throw err;
  }
}
