import {
  TextToSpeechProvider,
  AudioOutput,
  TTSOptions,
  ProviderOperationalStatus,
  VOICE_ERRORS
} from '../types.js';
import { VoiceCache } from '../cache.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('GeminiTTSProvider');

export interface GeminiTTSProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  voiceName?: string;
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
  maxRequestsPerMinute?: number;
  maxRequestsPerDay?: number;
  allowPaidProviders?: boolean;
  cache?: VoiceCache;
}

export class GeminiTTSProvider implements TextToSpeechProvider {
  public readonly id = 'gemini-tts';
  public readonly name = 'Google Gemini TTS';
  public readonly isLocal = false;
  public readonly isPaid = false; // Strictly zero-cost free-tier provider

  private apiKey?: string;
  private baseUrl: string;
  private model: string;
  private voiceName: string;
  private timeoutMs: number;
  private maxRetries: number;
  private initialDelayMs: number;
  private maxRequestsPerMinute: number;
  private maxRequestsPerDay: number;
  private allowPaidProviders: boolean;
  private cache?: VoiceCache;

  private operationalStatus: ProviderOperationalStatus = 'READY';
  private rateLimitUntil?: Date;
  private requestTimestamps: number[] = [];
  private dailyRequestCount = 0;
  private dailyResetTime = Date.now() + 86400000;

  constructor(options: GeminiTTSProviderOptions = {}) {
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

    // Default to the high-efficiency Gemini Flash TTS model supported on Google AI Studio
    this.model =
      options.model ||
      process.env.GEMINI_TTS_MODEL ||
      'gemini-2.5-flash-preview-tts';

    // Default to 'Charon' (mature, articulate, sophisticated male vocal profile)
    this.voiceName =
      options.voiceName ||
      process.env.GEMINI_TTS_VOICE ||
      'Charon';

    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.maxRequestsPerMinute =
      options.maxRequestsPerMinute ??
      (process.env.GEMINI_MAX_REQUESTS_PER_MINUTE
        ? parseInt(process.env.GEMINI_MAX_REQUESTS_PER_MINUTE, 10)
        : 15);
    this.maxRequestsPerDay =
      options.maxRequestsPerDay ??
      (process.env.GEMINI_MAX_REQUESTS_PER_DAY
        ? parseInt(process.env.GEMINI_MAX_REQUESTS_PER_DAY, 10)
        : 1500);
    this.allowPaidProviders =
      options.allowPaidProviders ??
      (process.env.JARVIS_ALLOW_PAID_PROVIDERS === 'true');

    this.cache = options.cache;

    if (!this.apiKey) {
      this.operationalStatus = 'MISCONFIGURED';
    }
  }

  public getModel(): string {
    return this.model;
  }

  public getVoiceName(): string {
    return this.voiceName;
  }

  public getOperationalStatus(): ProviderOperationalStatus {
    this.checkRateLimitReset();
    return this.operationalStatus;
  }

  public getRetryAfterSeconds(): number | undefined {
    if (this.rateLimitUntil && this.rateLimitUntil.getTime() > Date.now()) {
      return Math.ceil((this.rateLimitUntil.getTime() - Date.now()) / 1000);
    }
    return undefined;
  }

  public async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      this.operationalStatus = 'MISCONFIGURED';
      return false;
    }
    this.checkRateLimitReset();
    if (this.operationalStatus === 'RATE_LIMITED') {
      return false;
    }
    return true;
  }

  /**
   * Synthesize text to speech using official Gemini API audio modality.
   */
  public async synthesize(text: string, options?: TTSOptions): Promise<AudioOutput> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text to synthesize cannot be empty');
    }

    const selectedVoice = options?.voice || this.voiceName;

    // Check optional cache for static phrases
    if (this.cache) {
      const cached = this.cache.get(text, selectedVoice, this.model);
      if (cached) {
        return cached;
      }
    }

    // Candidate models to attempt in order of reliability and quota availability
    const candidateModels = Array.from(new Set([
      this.model,
      'gemini-2.5-flash-preview-tts',
      'gemini-3.1-flash-tts-preview',
      'gemini-3.8-flash-lite-tts'
    ]));

    let lastError: any = null;

    for (const currentModel of candidateModels) {
      try {
        const sanitizedEndpoint = `${this.baseUrl}/models/${currentModel}:generateContent`;
        const requestUrl = `${sanitizedEndpoint}?key=${this.apiKey}`;

        const payload = {
          contents: [
            {
              role: 'user',
              parts: [{ text: text.trim() }],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
          },
        };

        let attempt = 0;
        while (attempt <= this.maxRetries) {
          attempt++;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeoutMs);

          try {
            const response = await fetch(requestUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });

            clearTimeout(timer);

            if (!response.ok) {
              if (response.status === 429) {
                logger.warn(`Model ${currentModel} returned 429 quota limit. Trying next candidate model...`);
                throw Object.assign(new Error(`429 on ${currentModel}`), { code: VOICE_ERRORS.QUOTA_EXHAUSTED });
              }
              await this.handleHttpError(response, attempt);
              continue;
            }

            const data: any = await response.json();
            const candidate = data.candidates?.[0];
            const audioPart = candidate?.content?.parts?.find(
              (p: any) => p.inlineData && p.inlineData.data
            );

            if (!audioPart || !audioPart.inlineData?.data) {
              throw new Error('Gemini TTS returned no audio data in response payload');
            }

            const rawBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
            const incomingMime = audioPart.inlineData.mimeType || 'audio/wav';

            // Normalize output to standard WAV container
            const normalized = this.normalizeAudioToWav(rawBuffer, incomingMime);

            // Record in cache if cacheable
            if (this.cache) {
              this.cache.set(text, selectedVoice, currentModel, normalized);
            }

            this.model = currentModel;
            this.operationalStatus = 'READY';
            return normalized;
          } catch (err: any) {
            clearTimeout(timer);

            if (err.name === 'AbortError') {
              if (attempt <= this.maxRetries) {
                const delay = this.computeBackoff(attempt);
                await this.sleep(delay);
                continue;
              }
              throw new Error(`Gemini TTS request timed out on ${currentModel}`);
            }

            if (err.code === VOICE_ERRORS.QUOTA_EXHAUSTED) {
              throw err; // Escalate to outer model loop
            }

            if (attempt <= this.maxRetries && this.isTransientError(err)) {
              const delay = this.computeBackoff(attempt);
              await this.sleep(delay);
              continue;
            }

            throw err;
          }
        }
      } catch (modelErr: any) {
        lastError = modelErr;
        logger.warn(`Gemini TTS model ${currentModel} failed: ${modelErr.message}. Trying fallback candidate...`);
      }
    }

    throw lastError || new Error('All candidate Gemini TTS models failed');
  }

  /**
   * Stream synthesize speech via Gemini SSE streaming (Section 11).
   */
  public async *synthesizeStream(text: string, options?: TTSOptions): AsyncIterable<AudioOutput> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text to synthesize cannot be empty');
    }

    this.enforceRateLimitAndPolicy();

    const selectedVoice = options?.voice || this.voiceName;
    const requestUrl = `${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: text.trim() }],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: selectedVoice,
            },
          },
        },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs * 2);

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        await this.handleHttpError(response, 1);
      }

      if (!response.body) {
        throw new Error('Gemini TTS stream response has no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(jsonStr);
              const part = parsed.candidates?.[0]?.content?.parts?.[0];
              if (part?.inlineData?.data) {
                const chunkBuffer = Buffer.from(part.inlineData.data, 'base64');
                const mime = part.inlineData.mimeType || 'audio/wav';
                yield this.normalizeAudioToWav(chunkBuffer, mime);
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Normalizes incoming Gemini audio into a valid 16-bit PCM WAV container.
   * If input is already a RIFF WAV container, preserves it.
   * If raw PCM/L16, wraps with a 44-byte standard RIFF WAV header (24kHz, 16-bit, mono).
   */
  public normalizeAudioToWav(buffer: Buffer, mimeType: string): AudioOutput {
    // Check if buffer already starts with "RIFF"
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
      return {
        buffer,
        mimeType: 'audio/wav',
      };
    }

    // Default Gemini audio sample rate for Flash TTS is 24000 Hz, 16-bit, mono
    let sampleRate = 24000;
    const rateMatch = mimeType.match(/rate=(\d+)/);
    if (rateMatch) {
      sampleRate = parseInt(rateMatch[1], 10);
    }

    const wavHeader = this.createWavHeader(buffer.length, sampleRate, 1, 16);
    const combined = Buffer.concat([wavHeader, buffer]);

    return {
      buffer: combined,
      mimeType: 'audio/wav',
    };
  }

  /**
   * Generates a 44-byte standard RIFF/WAVE header for linear PCM audio.
   */
  public createWavHeader(dataLength: number, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return header;
  }

  private enforceRateLimitAndPolicy(): void {
    if (!this.apiKey) {
      this.operationalStatus = 'MISCONFIGURED';
      const err = new Error('Gemini API key is not configured. Set GEMINI_API_KEY in .env.');
      (err as any).code = VOICE_ERRORS.INVALID_KEY;
      throw err;
    }

    this.checkRateLimitReset();

    if (this.rateLimitUntil && this.rateLimitUntil.getTime() > Date.now()) {
      const waitSec = Math.ceil((this.rateLimitUntil.getTime() - Date.now()) / 1000);
      const err = new Error(
        `Gemini TTS rate limited by cooldown policy. Please retry in ${waitSec}s.`
      );
      (err as any).code = VOICE_ERRORS.RATE_LIMITED;
      (err as any).retryAfter = waitSec;
      throw err;
    }

    const now = Date.now();
    // Clean timestamps older than 60s
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);

    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      this.operationalStatus = 'RATE_LIMITED';
      const waitSec = 60 - Math.floor((now - this.requestTimestamps[0]) / 1000);
      this.rateLimitUntil = new Date(now + Math.max(waitSec, 5) * 1000);
      const err = new Error(
        `Gemini TTS local rate limit reached (${this.maxRequestsPerMinute} RPM). Cooldown active for ${waitSec}s.`
      );
      (err as any).code = VOICE_ERRORS.RATE_LIMITED;
      (err as any).retryAfter = waitSec;
      throw err;
    }

    if (this.dailyRequestCount >= this.maxRequestsPerDay) {
      this.operationalStatus = 'RATE_LIMITED';
      const err = new Error(
        `Gemini TTS daily quota limit reached (${this.maxRequestsPerDay} RPD). Free tier quota exhausted.`
      );
      (err as any).code = VOICE_ERRORS.QUOTA_EXHAUSTED;
      throw err;
    }

    this.requestTimestamps.push(now);
    this.dailyRequestCount++;
  }

  private async handleHttpError(response: Response, attempt: number): Promise<void> {
    const status = response.status;
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {
      // Ignore
    }

    // 401 / 403: Authentication or authorization error
    if (status === 401 || status === 403) {
      this.operationalStatus = 'MISCONFIGURED';
      const err = new Error(
        `Gemini TTS authentication failed (HTTP ${status}). Please verify GEMINI_API_KEY in .env.`
      );
      (err as any).code = VOICE_ERRORS.INVALID_KEY;
      throw err;
    }

    // 429: Too Many Requests / Quota Exceeded
    if (status === 429) {
      this.operationalStatus = 'RATE_LIMITED';
      let retrySec = 60;
      const retryHeader = response.headers.get('retry-after');
      if (retryHeader) {
        const parsed = parseInt(retryHeader, 10);
        if (!isNaN(parsed) && parsed > 0) {
          retrySec = parsed;
        }
      }
      this.rateLimitUntil = new Date(Date.now() + retrySec * 1000);

      const err = new Error(
        `Gemini TTS free tier rate limit or quota exceeded (HTTP 429). Retry after ${retrySec}s.`
      );
      (err as any).code = VOICE_ERRORS.QUOTA_EXHAUSTED;
      (err as any).retryAfter = retrySec;
      throw err;
    }

    // 408, 500, 502, 503, 504: Transient server errors
    if ([408, 500, 502, 503, 504].includes(status)) {
      if (attempt <= this.maxRetries) {
        const delay = this.computeBackoff(attempt);
        logger.warn(`Gemini TTS server error HTTP ${status}. Retrying in ${delay}ms...`);
        await this.sleep(delay);
        return;
      }
      const err = new Error(`Gemini TTS service unavailable (HTTP ${status}): ${errBody.slice(0, 200)}`);
      (err as any).code = VOICE_ERRORS.PROVIDER_UNAVAILABLE;
      throw err;
    }

    // Non-retryable client error (400, 404, etc.)
    const err = new Error(`Gemini TTS request rejected (HTTP ${status}): ${errBody.slice(0, 200)}`);
    (err as any).code = VOICE_ERRORS.PROVIDER_UNAVAILABLE;
    throw err;
  }

  private checkRateLimitReset(): void {
    const now = Date.now();
    if (now >= this.dailyResetTime) {
      this.dailyRequestCount = 0;
      this.dailyResetTime = now + 86400000;
    }
    if (this.rateLimitUntil && now >= this.rateLimitUntil.getTime()) {
      this.rateLimitUntil = undefined;
      this.operationalStatus = 'READY';
    }
  }

  private isTransientError(err: any): boolean {
    const msg = String(err?.message || '').toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('fetch failed')
    );
  }

  private computeBackoff(attempt: number): number {
    const exponential = this.initialDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * (exponential * 0.2));
    return Math.min(exponential + jitter, 10000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
