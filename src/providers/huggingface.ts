import {
  IAIProvider,
  ModelDescriptor,
  ProviderCapabilities,
  ProviderHealth,
  GenerateRequest,
  GenerateResponse,
  StreamChunk,
} from './types.js';
import { ProviderUnavailableError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('HuggingFaceProvider');

export interface HuggingFaceProviderOptions {
  apiKey?: string;
  timeoutMs?: number;
}

export class HuggingFaceProvider implements IAIProvider {
  public readonly id = 'huggingface';
  public readonly name = 'Hugging Face (Serverless Inference)';
  public readonly isPaid = false;
  public readonly isLocal = false;

  private apiKey?: string;
  private timeoutMs: number;
  private rateLimitUntil?: Date;

  constructor(options: HuggingFaceProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 30000;
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return {
        status: 'MISCONFIGURED',
        message: 'HUGGINGFACE_API_KEY is not configured.',
        lastChecked: new Date().toISOString(),
      };
    }

    if (this.rateLimitUntil && new Date() < this.rateLimitUntil) {
      return {
        status: 'RATE_LIMITED',
        message: `Hugging Face rate limited until ${this.rateLimitUntil.toISOString()}`,
        lastChecked: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    try {
      const res = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 429) {
        return {
          status: 'RATE_LIMITED',
          latencyMs: Date.now() - startTime,
          message: 'Hugging Face API quota/rate limit reached',
          lastChecked: new Date().toISOString(),
        };
      }

      if (!res.ok) {
        return {
          status: 'DEGRADED',
          latencyMs: Date.now() - startTime,
          message: `Hugging Face returned HTTP ${res.status}`,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        status: 'ONLINE',
        latencyMs: Date.now() - startTime,
        message: 'Hugging Face Serverless Inference online',
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'OFFLINE',
        latencyMs: Date.now() - startTime,
        message: `Cannot reach Hugging Face: ${(err as Error).message}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  public async listModels(): Promise<ModelDescriptor[]> {
    return [
      {
        id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        providerId: this.id,
        name: 'HF: Qwen 2.5 Coder 32B Instruct (Free Serverless)',
        contextWindow: 32768,
        supportsTools: false,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['CODING', 'GENERAL', 'LONG_CONTEXT', 'STREAMING', 'STRUCTURED_OUTPUT'],
        qualitativeCapabilities: {
          coding: 'HIGH',
          reasoning: 'HIGH',
          research: 'MEDIUM',
        },
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
        isFree: true,
        isLocal: false,
        speedClass: 'MODERATE',
        privacyClass: 'PUBLIC_CLOUD',
        availability: this.isRateLimited() ? 'RATE_LIMITED' : 'AVAILABLE',
      },
      {
        id: 'meta-llama/Llama-3.2-3B-Instruct',
        providerId: this.id,
        name: 'HF: Llama 3.2 3B Instruct (Free Serverless)',
        contextWindow: 16384,
        supportsTools: false,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: false,
        capabilities: ['GENERAL', 'FAST', 'STREAMING'],
        qualitativeCapabilities: {
          coding: 'LOW',
          reasoning: 'LOW',
          research: 'MEDIUM',
        },
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
        isFree: true,
        isLocal: false,
        speedClass: 'FAST',
        privacyClass: 'PUBLIC_CLOUD',
        availability: this.isRateLimited() ? 'RATE_LIMITED' : 'AVAILABLE',
      },
    ];
  }

  public async generate(request: GenerateRequest): Promise<GenerateResponse> {
    if (!this.apiKey) {
      throw new ProviderUnavailableError(this.id, 'HUGGINGFACE_API_KEY is not configured');
    }

    if (this.isRateLimited()) {
      throw new ProviderUnavailableError(this.id, 'Hugging Face is currently rate limited');
    }

    try {
      const url = `https://api-inference.huggingface.co/models/${request.modelId}/v1/chat/completions`;
      const payload: Record<string, unknown> = {
        model: request.modelId,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 429) {
        this.rateLimitUntil = new Date(Date.now() + 60000);
        throw new ProviderUnavailableError(this.id, 'Hugging Face rate limit reached (HTTP 429)');
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new ProviderUnavailableError(this.id, `Hugging Face HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json() as {
        id?: string;
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const choice = data.choices?.[0];
      const usage = data.usage;
      const promptTokens = usage?.prompt_tokens || 0;
      const completionTokens = usage?.completion_tokens || 0;

      return {
        id: data.id || `hf-${Date.now()}`,
        content: choice?.message?.content || '',
        finishReason: (choice?.finish_reason || 'stop') as any,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: usage?.total_tokens || (promptTokens + completionTokens),
          estimatedCostUSD: 0.0,
        },
      };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.id, `Hugging Face request failed: ${(err as Error).message}`, err as Error);
    }
  }

  public async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    if (!this.apiKey) {
      throw new ProviderUnavailableError(this.id, 'HUGGINGFACE_API_KEY is not configured');
    }

    try {
      const url = `https://api-inference.huggingface.co/models/${request.modelId}/v1/chat/completions`;
      const payload: Record<string, unknown> = {
        model: request.modelId,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok || !res.body) {
        throw new ProviderUnavailableError(this.id, `Hugging Face stream HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            yield { delta: '', finishReason: 'stop' };
            break;
          }

          try {
            const parsed = JSON.parse(dataStr) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield { delta };
            }
          } catch {
            // Partial
          }
        }
      }
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.id, `Hugging Face streaming failed: ${(err as Error).message}`, err as Error);
    }
  }

  public getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalling: false,
      supportsStructuredOutput: true,
      supportsVision: false,
    };
  }

  private isRateLimited(): boolean {
    return !!(this.rateLimitUntil && new Date() < this.rateLimitUntil);
  }
}
