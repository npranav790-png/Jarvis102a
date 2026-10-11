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

const logger = rootLogger.child('OllamaProvider');

export interface OllamaProviderOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export class OllamaProvider implements IAIProvider {
  public readonly id = 'ollama';
  public readonly name = 'Ollama (Local)';
  public readonly isPaid = false;
  public readonly isLocal = true;

  private baseUrl: string;
  private timeoutMs: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 120000;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return {
          status: 'DEGRADED',
          latencyMs: Date.now() - startTime,
          message: `Ollama returned HTTP ${res.status}`,
          lastChecked: new Date().toISOString(),
        };
      }

      const data = await res.json() as { version?: string };
      return {
        status: 'ONLINE',
        latencyMs: Date.now() - startTime,
        message: `Ollama v${data.version || 'unknown'} online`,
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'OFFLINE',
        latencyMs: Date.now() - startTime,
        message: `Ollama not reachable at ${this.baseUrl}: ${(err as Error).message}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  public async listModels(): Promise<ModelDescriptor[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        logger.warn(`Failed to list Ollama models: HTTP ${res.status}`);
        return this.getDefaultKnownModels();
      }

      const data = await res.json() as { models?: Array<{ name: string; details?: { family?: string; parameter_size?: string } }> };
      if (!data.models || data.models.length === 0) {
        return this.getDefaultKnownModels();
      }

      return data.models.map((m) => {
        const isCoder = /coder|code|dev/i.test(m.name);
        const isQwen = /qwen/i.test(m.name);
        return {
          id: m.name,
          providerId: this.id,
          name: `Ollama: ${m.name}`,
          contextWindow: isQwen ? 32768 : 8192,
          supportsTools: true,
          supportsStreaming: true,
          supportsJson: true,
          supportsVision: /vision|llava/i.test(m.name),
          supportsReasoning: true,
          capabilities: [
            'LOCAL',
            'GENERAL',
            'STREAMING',
            'STRUCTURED_OUTPUT',
            'TOOL_USE',
            'REASONING',
            ...(isCoder || isQwen ? ['CODING' as const] : []),
          ],
          qualitativeCapabilities: {
            coding: (isCoder || isQwen) ? 'HIGH' : 'MEDIUM',
            reasoning: isQwen ? 'HIGH' : 'MEDIUM',
            research: 'MEDIUM',
          },
          costPer1kInputTokens: 0.0,
          costPer1kOutputTokens: 0.0,
          isFree: true,
          isLocal: true,
          speedClass: 'FAST',
          privacyClass: 'LOCAL',
          availability: 'AVAILABLE',
        };
      });
    } catch (err) {
      logger.debug(`Ollama model discovery skipped (not running): ${(err as Error).message}`);
      return this.getDefaultKnownModels();
    }
  }

  public async generate(request: GenerateRequest): Promise<GenerateResponse> {
    try {
      const payload: Record<string, unknown> = {
        model: request.modelId,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      };

      if (request.responseFormat?.type === 'json' || request.jsonSchema) {
        payload.format = 'json';
      }

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new ProviderUnavailableError(
          this.id,
          `Ollama HTTP ${res.status}: ${errorText || res.statusText}`
        );
      }

      const data = await res.json() as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const promptTokens = data.prompt_eval_count || 0;
      const completionTokens = data.eval_count || 0;

      return {
        id: `ollama-${Date.now()}`,
        content: data.message?.content || '',
        finishReason: 'stop',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          estimatedCostUSD: 0.0,
        },
      };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        throw err;
      }
      throw new ProviderUnavailableError(this.id, `Ollama call failed: ${(err as Error).message}`, err as Error);
    }
  }

  public async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    try {
      const payload: Record<string, unknown> = {
        model: request.modelId,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      };

      if (request.responseFormat?.type === 'json' || request.jsonSchema) {
        payload.format = 'json';
      }

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok || !res.body) {
        throw new ProviderUnavailableError(this.id, `Ollama stream HTTP ${res.status}`);
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
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
            if (parsed.message?.content) {
              yield { delta: parsed.message.content };
            }
            if (parsed.done) {
              yield { delta: '', finishReason: 'stop' };
            }
          } catch {
            // Partial JSON chunk line
          }
        }
      }
    } catch (err) {
      throw new ProviderUnavailableError(this.id, `Ollama streaming error: ${(err as Error).message}`, err as Error);
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

  private getDefaultKnownModels(): ModelDescriptor[] {
    return [
      {
        id: 'qwen3.5:8b',
        providerId: this.id,
        name: 'Ollama: Qwen 3.5 8B (Local Hybrid Reasoning)',
        contextWindow: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['LOCAL', 'GENERAL', 'CODING', 'REASONING', 'STREAMING', 'STRUCTURED_OUTPUT', 'TOOL_USE'],
        qualitativeCapabilities: {
          coding: 'HIGH',
          reasoning: 'HIGH',
          research: 'HIGH',
        },
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
        isFree: true,
        isLocal: true,
        speedClass: 'FAST',
        privacyClass: 'LOCAL',
        availability: 'AVAILABLE',
      },
      {
        id: 'qwen2.5:8b',
        providerId: this.id,
        name: 'Ollama: Qwen 2.5 8B (Local Fast & Coding)',
        contextWindow: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['LOCAL', 'GENERAL', 'CODING', 'REASONING', 'STREAMING', 'STRUCTURED_OUTPUT', 'TOOL_USE'],
        qualitativeCapabilities: {
          coding: 'HIGH',
          reasoning: 'HIGH',
          research: 'HIGH',
        },
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
        isFree: true,
        isLocal: true,
        speedClass: 'FAST',
        privacyClass: 'LOCAL',
        availability: 'AVAILABLE',
      },
      {
        id: 'qwen2.5:7b',
        providerId: this.id,
        name: 'Ollama: Qwen 2.5 7B (Local Fast & General)',
        contextWindow: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['LOCAL', 'GENERAL', 'CODING', 'REASONING', 'STREAMING', 'STRUCTURED_OUTPUT', 'TOOL_USE'],
        qualitativeCapabilities: {
          coding: 'HIGH',
          reasoning: 'HIGH',
          research: 'HIGH',
        },
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
        isFree: true,
        isLocal: true,
        speedClass: 'FAST',
        privacyClass: 'LOCAL',
        availability: 'AVAILABLE',
      },
      {
        id: 'llama3:8b',
        providerId: this.id,
        name: 'Ollama: llama3:8b (Local)',
        contextWindow: 8192,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['LOCAL', 'GENERAL', 'STREAMING', 'STRUCTURED_OUTPUT', 'TOOL_USE', 'REASONING'],
        qualitativeCapabilities: {
          coding: 'MEDIUM',
          reasoning: 'MEDIUM',
          research: 'MEDIUM',
        },
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
        isFree: true,
        isLocal: true,
        speedClass: 'FAST',
        privacyClass: 'LOCAL',
        availability: 'AVAILABLE',
      },
    ];
  }
}
