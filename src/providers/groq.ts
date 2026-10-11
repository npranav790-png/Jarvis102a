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

const logger = rootLogger.child('GroqProvider');

export interface GroqProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class GroqProvider implements IAIProvider {
  public readonly id = 'groq';
  public readonly name = 'Groq Cloud (Free Tier)';
  public readonly isPaid = false;
  public readonly isLocal = false;

  private apiKey?: string;
  private baseUrl: string;
  private timeoutMs: number;
  private rateLimitUntil?: Date;

  constructor(options: GroqProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 25000;
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return {
        status: 'MISCONFIGURED',
        message: 'GROQ_API_KEY is not set.',
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
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 429) {
        this.updateRateLimit(res);
        return {
          status: 'RATE_LIMITED',
          latencyMs: Date.now() - startTime,
          message: 'Groq API rate limit exceeded (HTTP 429)',
          lastChecked: new Date().toISOString(),
        };
      }

      if (!res.ok) {
        return {
          status: 'DEGRADED',
          latencyMs: Date.now() - startTime,
          message: `Groq returned HTTP ${res.status}`,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        status: 'ONLINE',
        latencyMs: Date.now() - startTime,
        message: 'Groq Cloud online (Free Tier)',
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'OFFLINE',
        latencyMs: Date.now() - startTime,
        message: `Cannot reach Groq API: ${(err as Error).message}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  public async listModels(): Promise<ModelDescriptor[]> {
    // Curated Groq Free Tier Models
    return [
      {
        id: 'llama-3.3-70b-versatile',
        providerId: this.id,
        name: 'Groq: Llama 3.3 70B Versatile (Free Tier)',
        contextWindow: 128000,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['GENERAL', 'CODING', 'REASONING', 'RESEARCH', 'FAST', 'LONG_CONTEXT', 'TOOL_USE', 'STREAMING', 'STRUCTURED_OUTPUT'],
        qualitativeCapabilities: {
          coding: 'HIGH',
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
      {
        id: 'llama-3.1-8b-instant',
        providerId: this.id,
        name: 'Groq: Llama 3.1 8B Instant (Ultra-Fast Free Tier)',
        contextWindow: 128000,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['GENERAL', 'FAST', 'LONG_CONTEXT', 'TOOL_USE', 'STREAMING', 'STRUCTURED_OUTPUT'],
        qualitativeCapabilities: {
          coding: 'MEDIUM',
          reasoning: 'MEDIUM',
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
        id: 'mixtral-8x7b-32768',
        providerId: this.id,
        name: 'Groq: Mixtral 8x7B (Free Tier)',
        contextWindow: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['GENERAL', 'CODING', 'LONG_CONTEXT', 'STREAMING', 'STRUCTURED_OUTPUT'],
        qualitativeCapabilities: {
          coding: 'HIGH',
          reasoning: 'MEDIUM',
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
      throw new ProviderUnavailableError(this.id, 'GROQ_API_KEY is not configured');
    }

    if (this.isRateLimited()) {
      throw new ProviderUnavailableError(this.id, `Groq is rate limited until ${this.rateLimitUntil?.toISOString()}`);
    }

    try {
      const payload: Record<string, unknown> = {
        model: request.modelId,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
          name: m.name,
          tool_call_id: m.toolCallId,
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      };

      if (request.responseFormat?.type === 'json' || request.jsonSchema) {
        payload.response_format = { type: 'json_object' };
      }

      if (request.tools && request.tools.length > 0) {
        payload.tools = request.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 429) {
        this.updateRateLimit(res);
        throw new ProviderUnavailableError(this.id, 'Groq rate limit exceeded (HTTP 429)');
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new ProviderUnavailableError(this.id, `Groq HTTP ${res.status}: ${errorText || res.statusText}`);
      }

      const data = await res.json() as {
        id?: string;
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const choice = data.choices?.[0];
      const toolCalls = choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

      const usage = data.usage;
      const promptTokens = usage?.prompt_tokens || 0;
      const completionTokens = usage?.completion_tokens || 0;

      return {
        id: data.id || `groq-${Date.now()}`,
        content: choice?.message?.content || '',
        finishReason: (choice?.finish_reason || 'stop') as any,
        toolCalls,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: usage?.total_tokens || (promptTokens + completionTokens),
          estimatedCostUSD: 0.0, // Strictly ₹0 Free Tier
        },
      };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.id, `Groq request failed: ${(err as Error).message}`, err as Error);
    }
  }

  public async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    if (!this.apiKey) {
      throw new ProviderUnavailableError(this.id, 'GROQ_API_KEY is not configured');
    }

    if (this.isRateLimited()) {
      throw new ProviderUnavailableError(this.id, `Groq is rate limited until ${this.rateLimitUntil?.toISOString()}`);
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

      if (request.responseFormat?.type === 'json' || request.jsonSchema) {
        payload.response_format = { type: 'json_object' };
      }

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 429) {
        this.updateRateLimit(res);
        throw new ProviderUnavailableError(this.id, 'Groq rate limit exceeded (HTTP 429)');
      }

      if (!res.ok || !res.body) {
        throw new ProviderUnavailableError(this.id, `Groq stream HTTP ${res.status}`);
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
              choices?: Array<{
                delta?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
                finish_reason?: string;
              }>;
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
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.id, `Groq stream failed: ${(err as Error).message}`, err as Error);
    }
  }

  public getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsStructuredOutput: true,
      supportsVision: false,
    };
  }

  private isRateLimited(): boolean {
    return !!(this.rateLimitUntil && new Date() < this.rateLimitUntil);
  }

  private updateRateLimit(res: Response): void {
    const retryAfter = res.headers.get('retry-after');
    const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
    this.rateLimitUntil = new Date(Date.now() + (seconds || 60) * 1000);
    logger.warn(`Groq rate limit active until: ${this.rateLimitUntil.toISOString()}`);
  }
}
