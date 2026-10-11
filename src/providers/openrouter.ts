import {
  IAIProvider,
  ModelDescriptor,
  ProviderCapabilities,
  ProviderHealth,
  GenerateRequest,
  GenerateResponse,
  StreamChunk,
} from './types.js';
import { ProviderUnavailableError, CostLimitExceededError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('OpenRouterProvider');

export interface OpenRouterProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class OpenRouterProvider implements IAIProvider {
  public readonly id = 'openrouter';
  public readonly name = 'OpenRouter (Free Models)';
  public readonly isPaid = false;
  public readonly isLocal = false;

  private apiKey?: string;
  private baseUrl: string;
  private timeoutMs: number;
  private rateLimitUntil?: Date;

  constructor(options: OpenRouterProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 30000;
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return {
        status: 'MISCONFIGURED',
        message: 'OPENROUTER_API_KEY is not set.',
        lastChecked: new Date().toISOString(),
      };
    }

    if (this.rateLimitUntil && new Date() < this.rateLimitUntil) {
      return {
        status: 'RATE_LIMITED',
        message: `Rate limited until ${this.rateLimitUntil.toISOString()}`,
        lastChecked: new Date().toISOString(),
        rateLimitResetTime: this.rateLimitUntil.toISOString(),
      };
    }

    const startTime = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(6000),
      });

      if (res.status === 429) {
        this.updateRateLimit(res);
        return {
          status: 'RATE_LIMITED',
          latencyMs: Date.now() - startTime,
          message: 'OpenRouter rate limit reached',
          lastChecked: new Date().toISOString(),
        };
      }

      if (!res.ok) {
        return {
          status: 'DEGRADED',
          latencyMs: Date.now() - startTime,
          message: `OpenRouter returned HTTP ${res.status}`,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        status: 'ONLINE',
        latencyMs: Date.now() - startTime,
        message: 'OpenRouter online with verified free models',
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'OFFLINE',
        latencyMs: Date.now() - startTime,
        message: `Cannot reach OpenRouter: ${(err as Error).message}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  public async listModels(): Promise<ModelDescriptor[]> {
    // Curated known free tier models on OpenRouter
    return [
      {
        id: 'qwen/qwen-2.5-coder-32b-instruct:free',
        providerId: this.id,
        name: 'OpenRouter: Qwen 2.5 Coder 32B (Free)',
        contextWindow: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['CODING', 'GENERAL', 'LONG_CONTEXT', 'TOOL_USE', 'STREAMING', 'STRUCTURED_OUTPUT'],
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
        id: 'qwen/qwen-2.5-7b-instruct:free',
        providerId: this.id,
        name: 'OpenRouter: Qwen 2.5 7B Instruct (Free)',
        contextWindow: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['CODING', 'GENERAL', 'REASONING', 'STREAMING', 'STRUCTURED_OUTPUT'],
        qualitativeCapabilities: {
          coding: 'HIGH',
          reasoning: 'HIGH',
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
      {
        id: 'meta-llama/llama-3.2-3b-instruct:free',
        providerId: this.id,
        name: 'OpenRouter: Llama 3.2 3B Instruct (Free)',
        contextWindow: 131072,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: false,
        capabilities: ['GENERAL', 'FAST', 'LONG_CONTEXT', 'STREAMING'],
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
      {
        id: 'google/gemini-2.0-flash-lite-preview-02-05:free',
        providerId: this.id,
        name: 'OpenRouter: Gemini 2.0 Flash Lite (Free)',
        contextWindow: 1048576,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: true,
        supportsReasoning: true,
        capabilities: ['GENERAL', 'FAST', 'LONG_CONTEXT', 'REASONING', 'STREAMING', 'STRUCTURED_OUTPUT', 'VISION'],
        qualitativeCapabilities: {
          coding: 'MEDIUM',
          reasoning: 'HIGH',
          research: 'HIGH',
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
      throw new ProviderUnavailableError(this.id, 'OPENROUTER_API_KEY is not configured');
    }

    if (!request.modelId.endsWith(':free')) {
      throw new CostLimitExceededError(0.001, 0.0);
    }

    if (this.isRateLimited()) {
      throw new ProviderUnavailableError(this.id, `OpenRouter is rate limited until ${this.rateLimitUntil?.toISOString()}`);
    }

    try {
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

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/jarvis-core',
          'X-Title': 'JARVIS 2.0 Core Engine',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 429) {
        this.updateRateLimit(res);
        throw new ProviderUnavailableError(this.id, 'OpenRouter rate limit exceeded (HTTP 429)');
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new ProviderUnavailableError(this.id, `OpenRouter HTTP ${res.status}: ${errorText || res.statusText}`);
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
        id: data.id || `openrouter-${Date.now()}`,
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
      if (err instanceof ProviderUnavailableError || err instanceof CostLimitExceededError) throw err;
      throw new ProviderUnavailableError(this.id, `OpenRouter call failed: ${(err as Error).message}`, err as Error);
    }
  }

  public async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    if (!this.apiKey) {
      throw new ProviderUnavailableError(this.id, 'OPENROUTER_API_KEY is not configured');
    }

    if (!request.modelId.endsWith(':free')) {
      throw new CostLimitExceededError(0.001, 0.0);
    }

    if (this.isRateLimited()) {
      throw new ProviderUnavailableError(this.id, `OpenRouter is rate limited until ${this.rateLimitUntil?.toISOString()}`);
    }

    try {
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

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/jarvis-core',
          'X-Title': 'JARVIS 2.0 Core Engine',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 429) {
        this.updateRateLimit(res);
        throw new ProviderUnavailableError(this.id, 'OpenRouter rate limit exceeded (HTTP 429)');
      }

      if (!res.ok || !res.body) {
        throw new ProviderUnavailableError(this.id, `OpenRouter stream HTTP ${res.status}`);
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
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield { delta };
            }
          } catch {
            // Partial JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof ProviderUnavailableError || err instanceof CostLimitExceededError) throw err;
      throw new ProviderUnavailableError(this.id, `OpenRouter streaming failed: ${(err as Error).message}`, err as Error);
    }
  }

  public getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsStructuredOutput: true,
      supportsVision: true,
    };
  }

  private isRateLimited(): boolean {
    return !!(this.rateLimitUntil && new Date() < this.rateLimitUntil);
  }

  private updateRateLimit(res: Response): void {
    const retryAfter = res.headers.get('retry-after');
    const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
    this.rateLimitUntil = new Date(Date.now() + (seconds || 60) * 1000);
    logger.warn(`OpenRouter rate limit active until: ${this.rateLimitUntil.toISOString()}`);
  }
}
