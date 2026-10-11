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

const logger = rootLogger.child('GeminiProvider');

export const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
export const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 422]);

export function computeBackoffWithJitter(attempt: number, baseMs = 1000, factor = 2, maxMs = 10000): number {
  const exponential = baseMs * Math.pow(factor, attempt - 1);
  const jitter = Math.floor(Math.random() * (exponential * 0.2));
  return Math.min(exponential + jitter, maxMs);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface GeminiProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  defaultModel?: string;
  maxRetries?: number;
  initialDelayMs?: number;
  maxRequestsPerMinute?: number;
  maxRequestsPerDay?: number;
}

export class GeminiProvider implements IAIProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini';
  public readonly isPaid = false;
  public readonly isLocal = false;

  private apiKey?: string;
  private baseUrl: string;
  private timeoutMs: number;
  private defaultModel: string;
  private maxRetries: number;
  private initialDelayMs: number;
  private rateLimitUntil?: Date;
  private maxRequestsPerMinute: number;
  private maxRequestsPerDay: number;
  private requestTimestamps: number[] = [];
  private dailyRequestCount = 0;
  private dailyResetTime = Date.now() + 86400000;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
    this.baseUrl = (options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 45000;
    this.defaultModel = options.defaultModel || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    this.maxRetries = options.maxRetries ?? 3;
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.maxRequestsPerMinute = options.maxRequestsPerMinute ?? (process.env.GEMINI_MAX_REQUESTS_PER_MINUTE ? parseInt(process.env.GEMINI_MAX_REQUESTS_PER_MINUTE, 10) : 15);
    this.maxRequestsPerDay = options.maxRequestsPerDay ?? (process.env.GEMINI_MAX_REQUESTS_PER_DAY ? parseInt(process.env.GEMINI_MAX_REQUESTS_PER_DAY, 10) : 1500);
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  public getApiKey(): string | undefined {
    return this.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  }

  public setDefaultModel(model: string): void {
    this.defaultModel = model;
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  public getRateLimitStats(): { requestsLastMinute: number; maxRpm: number; dailyRequests: number; maxRpd: number } {
    const now = Date.now();
    const recent = this.requestTimestamps.filter((t) => now - t < 60000).length;
    return {
      requestsLastMinute: recent,
      maxRpm: this.maxRequestsPerMinute,
      dailyRequests: this.dailyRequestCount,
      maxRpd: this.maxRequestsPerDay,
    };
  }

  private checkAndRecordRequest(): void {
    const now = Date.now();
    if (now >= this.dailyResetTime) {
      this.dailyRequestCount = 0;
      this.dailyResetTime = now + 86400000;
    }

    if (this.dailyRequestCount >= this.maxRequestsPerDay) {
      this.rateLimitUntil = new Date(this.dailyResetTime);
      throw new ProviderUnavailableError(
        this.id,
        `Gemini daily free tier limit of ${this.maxRequestsPerDay} requests reached. Cooldown until ${this.rateLimitUntil.toISOString()}`
      );
    }

    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldest = this.requestTimestamps[0];
      const waitMs = Math.max(1000, 60000 - (now - oldest));
      this.rateLimitUntil = new Date(now + waitMs);
      throw new ProviderUnavailableError(
        this.id,
        `Gemini rate limit threshold reached (${this.maxRequestsPerMinute} req/min). Cooldown until ${this.rateLimitUntil.toISOString()}`
      );
    }

    this.requestTimestamps.push(now);
    this.dailyRequestCount++;
  }

  private isRateLimited(): boolean {
    const now = Date.now();
    if (this.rateLimitUntil) {
      if (now >= this.rateLimitUntil.getTime()) {
        this.rateLimitUntil = undefined;
      } else {
        return true;
      }
    }
    if (now >= this.dailyResetTime) {
      this.dailyRequestCount = 0;
      this.dailyResetTime = now + 86400000;
    }
    if (this.dailyRequestCount >= this.maxRequestsPerDay) {
      return true;
    }
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      return true;
    }
    return false;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const key = this.getApiKey();
    if (!key) {
      return {
        status: 'MISCONFIGURED',
        message: 'GEMINI_API_KEY is not configured. Provide an API key from Google AI Studio (https://aistudio.google.com/app/apikey).',
        lastChecked: new Date().toISOString(),
      };
    }

    if (this.isRateLimited()) {
      return {
        status: 'RATE_LIMITED',
        message: `Gemini API rate limited until ${this.rateLimitUntil?.toISOString()}`,
        lastChecked: new Date().toISOString(),
        rateLimitResetTime: this.rateLimitUntil?.toISOString(),
      };
    }

    const startTime = Date.now();
    let lastError: Error | null = null;
    let lastStatus = 0;
    let lastErrorText = '';

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/models?key=${key}`, {
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          return {
            status: 'ONLINE',
            latencyMs: Date.now() - startTime,
            message: 'Google Gemini Online (Free Tier)',
            lastChecked: new Date().toISOString(),
          };
        }

        lastStatus = res.status;
        lastErrorText = await res.text().catch(() => '');

        // Non-retryable errors
        if (NON_RETRYABLE_HTTP_STATUSES.has(res.status)) {
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            return {
              status: 'MISCONFIGURED',
              latencyMs: Date.now() - startTime,
              message: `Invalid or unauthorized Gemini API key (HTTP ${res.status}). Please verify your GEMINI_API_KEY from Google AI Studio.`,
              lastChecked: new Date().toISOString(),
            };
          }
          return {
            status: 'DEGRADED',
            latencyMs: Date.now() - startTime,
            message: `Gemini returned HTTP ${res.status}: ${lastErrorText.slice(0, 120)}`,
            lastChecked: new Date().toISOString(),
          };
        }

        // Rate limiting (429)
        if (res.status === 429) {
          this.rateLimitUntil = new Date(Date.now() + 60000);
          if (attempt <= this.maxRetries) {
            const delayMs = computeBackoffWithJitter(attempt, this.initialDelayMs);
            logger.warn(`Gemini free tier rate limit reached (HTTP 429). Retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})...`);
            await sleep(delayMs);
            continue;
          }
          return {
            status: 'RATE_LIMITED',
            latencyMs: Date.now() - startTime,
            message: 'Gemini free tier rate limit reached (HTTP 429)',
            lastChecked: new Date().toISOString(),
          };
        }

        // Transient errors (503, 500, 502, 504, 408)
        if (TRANSIENT_HTTP_STATUSES.has(res.status)) {
          if (attempt <= this.maxRetries) {
            const delayMs = computeBackoffWithJitter(attempt, this.initialDelayMs);
            logger.warn(`Gemini API transient error (HTTP ${res.status}). Retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})...`);
            await sleep(delayMs);
            continue;
          }
          return {
            status: 'TEMPORARILY_UNAVAILABLE',
            latencyMs: Date.now() - startTime,
            message: `Google Gemini service is temporarily unavailable (HTTP ${res.status}). Retries exhausted.`,
            lastChecked: new Date().toISOString(),
          };
        }

        return {
          status: 'DEGRADED',
          latencyMs: Date.now() - startTime,
          message: `Gemini returned HTTP ${res.status}: ${lastErrorText.slice(0, 120)}`,
          lastChecked: new Date().toISOString(),
        };
      } catch (err) {
        lastError = err as Error;
        if (attempt <= this.maxRetries) {
          const delayMs = computeBackoffWithJitter(attempt, this.initialDelayMs);
          logger.warn(`Gemini API connectivity error (${lastError.message}). Retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})...`);
          await sleep(delayMs);
          continue;
        }
      }
    }

    return {
      status: lastStatus === 503 || lastStatus === 500 || lastStatus === 502 || lastStatus === 504 ? 'TEMPORARILY_UNAVAILABLE' : 'OFFLINE',
      latencyMs: Date.now() - startTime,
      message: lastError ? `Cannot reach Gemini API: ${lastError.message}` : `Google Gemini service is temporarily unavailable (HTTP ${lastStatus}).`,
      lastChecked: new Date().toISOString(),
    };
  }

  public async listModels(): Promise<ModelDescriptor[]> {
    return [
      {
        id: 'gemini-3.7-flash',
        providerId: this.id,
        name: 'Google: Gemini 3.7 Flash (Flagship Fast & Hybrid Reasoning)',
        contextWindow: 1048576,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: true,
        supportsReasoning: true,
        capabilities: [
          'GENERAL',
          'CODING',
          'REASONING',
          'RESEARCH',
          'FAST',
          'LONG_CONTEXT',
          'TOOL_USE',
          'STREAMING',
          'STRUCTURED_OUTPUT',
          'VISION',
        ],
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
        id: 'gemini-3.5-flash',
        providerId: this.id,
        name: 'Google: Gemini 3.5 Flash (High Efficiency Free Tier)',
        contextWindow: 1048576,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: true,
        supportsReasoning: true,
        capabilities: [
          'GENERAL',
          'CODING',
          'FAST',
          'LONG_CONTEXT',
          'TOOL_USE',
          'STREAMING',
          'STRUCTURED_OUTPUT',
          'VISION',
        ],
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
        id: 'gemini-3.5-flash-lite',
        providerId: this.id,
        name: 'Google: Gemini 3.5 Flash Lite (Ultra Low Latency Free Tier)',
        contextWindow: 1048576,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: true,
        supportsReasoning: false,
        capabilities: [
          'GENERAL',
          'CODING',
          'FAST',
          'LONG_CONTEXT',
          'TOOL_USE',
          'STREAMING',
          'STRUCTURED_OUTPUT',
          'VISION',
        ],
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
      {
        id: 'gemini-3.1-flash-lite',
        providerId: this.id,
        name: 'Google: Gemini 3.1 Flash Lite (Lowest Latency Free Tier)',
        contextWindow: 1048576,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: true,
        supportsReasoning: false,
        capabilities: [
          'GENERAL',
          'FAST',
          'STREAMING',
          'STRUCTURED_OUTPUT',
          'VISION',
        ],
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
        id: 'gemini-3-flash-preview',
        providerId: this.id,
        name: 'Google: Gemini 3 Flash Preview (General Intelligence)',
        contextWindow: 1048576,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: true,
        supportsReasoning: true,
        capabilities: [
          'GENERAL',
          'CODING',
          'REASONING',
          'RESEARCH',
          'LONG_CONTEXT',
          'TOOL_USE',
          'STREAMING',
          'STRUCTURED_OUTPUT',
          'VISION',
        ],
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
      }
    ];
  }

  public async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ProviderUnavailableError(this.id, 'GEMINI_API_KEY is not configured');
    }

    if (this.isRateLimited()) {
      throw new ProviderUnavailableError(
        this.id,
        `Gemini API is rate limited until ${this.rateLimitUntil?.toISOString()}`
      );
    }

    this.checkAndRecordRequest();

    const modelName = request.modelId?.includes('gemini') ? request.modelId : (this.defaultModel || 'gemini-3.7-flash');

    // 1. Separate system instructions from conversational messages
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const chatMessages = request.messages.filter((m) => m.role !== 'system');

    // Default system instruction if not supplied
    const systemInstructionText = systemMessages.map((m) => m.content).join('\n') || 
      'You are JARVIS, an autonomous, highly sophisticated, concise, and helpful personal AI assistant.';

    // Format contents for Gemini (including multimodal attachments)
    const contents = chatMessages.map((m) => {
      const parts: Array<Record<string, unknown>> = [{ text: m.content || ' ' }];
      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          parts.push({
            inline_data: {
              mime_type: att.mimeType,
              data: att.data,
            },
          });
        }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    // If contents is empty, ensure at least one user prompt
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const payload: Record<string, unknown> = {
      system_instruction: {
        parts: [{ text: systemInstructionText }],
      },
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4096,
      },
    };

    if (request.thinkingBudget !== undefined) {
      (payload.generationConfig as Record<string, unknown>).thinking_config = {
        thinking_budget: request.thinkingBudget,
      };
    }

    if (request.responseFormat?.type === 'json' || request.jsonSchema) {
      (payload.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = [
        {
          function_declarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    let lastError: Error | null = null;
    let lastStatus = 0;
    let lastErrorText = '';

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/models/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        // Non-retryable errors (400, 401, 403, 404, etc.)
        if (NON_RETRYABLE_HTTP_STATUSES.has(res.status)) {
          const errorText = await res.text().catch(() => '');
          if (res.status === 401 || res.status === 403) {
            throw new ProviderUnavailableError(this.id, `Invalid or unauthorized Gemini API key (HTTP ${res.status}): ${errorText.slice(0, 150)}`);
          }
          if (res.status === 404) {
            throw new ProviderUnavailableError(this.id, `Gemini model '${modelName}' not found (HTTP 404): ${errorText.slice(0, 150)}`);
          }
          throw new ProviderUnavailableError(this.id, `Invalid request to Gemini (HTTP ${res.status}): ${errorText.slice(0, 150)}`);
        }

        // Transient status codes (408, 429, 500, 502, 503, 504)
        if (TRANSIENT_HTTP_STATUSES.has(res.status)) {
          lastStatus = res.status;
          lastErrorText = await res.text().catch(() => '');

          if (res.status === 429) {
            this.rateLimitUntil = new Date(Date.now() + 60000);
          }

          if (attempt <= this.maxRetries) {
            const delayMs = computeBackoffWithJitter(attempt, this.initialDelayMs);
            logger.warn(
              `Gemini API transient error for model '${modelName}' (HTTP ${res.status}). Retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})...`
            );
            await sleep(delayMs);
            continue;
          }

          if (res.status === 503) {
            throw new ProviderUnavailableError(
              this.id,
              `Google Gemini service is temporarily unavailable (HTTP 503) after ${this.maxRetries} retry attempts.`
            );
          }
          if (res.status === 429) {
            throw new ProviderUnavailableError(
              this.id,
              `Gemini free tier rate limit exceeded (HTTP 429) after ${this.maxRetries} retry attempts.`
            );
          }
          throw new ProviderUnavailableError(
            this.id,
            `Gemini service returned transient HTTP ${res.status} after ${this.maxRetries} retry attempts: ${lastErrorText.slice(0, 150)}`
          );
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          throw new ProviderUnavailableError(this.id, `Gemini HTTP ${res.status}: ${errorText.slice(0, 150)}`);
        }

        const data = await res.json() as {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                text?: string;
                functionCall?: {
                  name: string;
                  args?: Record<string, unknown>;
                };
              }>;
              role?: string;
            };
            finishReason?: string;
          }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
          };
        };

        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        let content = '';
        const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

        for (const part of parts) {
          if (part.text) {
            content += part.text;
          }
          if (part.functionCall) {
            toolCalls.push({
              id: `call_${Date.now()}_${toolCalls.length + 1}`,
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            });
          }
        }

        const promptTokens = data.usageMetadata?.promptTokenCount || 0;
        const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;

        let finishReason: 'stop' | 'length' | 'tool_calls' | 'error' = 'stop';
        if (candidate?.finishReason === 'MAX_TOKENS') finishReason = 'length';
        else if (toolCalls.length > 0) finishReason = 'tool_calls';
        else if (candidate?.finishReason && candidate.finishReason !== 'STOP') finishReason = 'stop';

        return {
          id: `gemini-${Date.now()}`,
          content,
          finishReason,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatedCostUSD: 0.0,
          },
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };
      } catch (err) {
        if (err instanceof ProviderUnavailableError) throw err;
        lastError = err as Error;
        if (attempt <= this.maxRetries) {
          const delayMs = computeBackoffWithJitter(attempt, this.initialDelayMs);
          logger.warn(
            `Gemini network/timeout error for model '${modelName}' (${lastError.message}). Retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})...`
          );
          await sleep(delayMs);
          continue;
        }
      }
    }

    throw new ProviderUnavailableError(
      this.id,
      `Gemini execution failed after ${this.maxRetries} retry attempts: ${lastError?.message || lastErrorText || 'Service Unavailable'}`
    );
  }

  public async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ProviderUnavailableError(this.id, 'GEMINI_API_KEY is not configured');
    }

    if (this.isRateLimited()) {
      throw new ProviderUnavailableError(
        this.id,
        `Gemini API is rate limited until ${this.rateLimitUntil?.toISOString()}`
      );
    }

    this.checkAndRecordRequest();

    const modelName = request.modelId?.includes('gemini') ? request.modelId : (this.defaultModel || 'gemini-3.7-flash');

    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const chatMessages = request.messages.filter((m) => m.role !== 'system');
    const systemInstructionText = systemMessages.map((m) => m.content).join('\n') || 
      'You are JARVIS, an autonomous, highly sophisticated, concise, and helpful personal AI assistant.';

    const contents = chatMessages.map((m) => {
      const parts: Array<Record<string, unknown>> = [{ text: m.content || ' ' }];
      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          parts.push({
            inline_data: {
              mime_type: att.mimeType,
              data: att.data,
            },
          });
        }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const payload: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemInstructionText }] },
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4096,
      },
    };

    if (request.thinkingBudget !== undefined) {
      (payload.generationConfig as Record<string, unknown>).thinking_config = {
        thinking_budget: request.thinkingBudget,
      };
    }

    if (request.responseFormat?.type === 'json' || request.jsonSchema) {
      (payload.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = [
        {
          function_declarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const res = await fetch(`${this.baseUrl}/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new ProviderUnavailableError(this.id, `Gemini Stream HTTP ${res.status}: ${errorText}`);
    }

    if (!res.body) {
      throw new ProviderUnavailableError(this.id, 'Gemini stream response body is null');
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
          const chunkData = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                  functionCall?: {
                    name: string;
                    args?: Record<string, unknown>;
                  };
                }>;
              };
              finishReason?: string;
            }>;
          };

          const part = chunkData.candidates?.[0]?.content?.parts?.[0];
          if (part?.text) {
            yield { delta: part.text };
          }
          if (part?.functionCall) {
            yield {
              delta: '',
              toolCalls: [{
                id: `call_${Date.now()}`,
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {}),
              }],
            };
          }
        } catch {
          // Ignore SSE chunk parse errors
        }
      }
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

  public async embed(text: string): Promise<number[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ProviderUnavailableError(this.id, 'GEMINI_API_KEY is not configured for embeddings');
    }

    const payload = {
      model: 'models/text-embedding-004',
      content: {
        parts: [{ text }],
      },
    };

    const res = await fetch(`${this.baseUrl}/models/text-embedding-004:embedContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new ProviderUnavailableError(this.id, `Gemini Embedding HTTP ${res.status}: ${errorText.slice(0, 150)}`);
    }

    const data = (await res.json()) as {
      embedding?: {
        values?: number[];
      };
    };

    return data.embedding?.values || [];
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ProviderUnavailableError(this.id, 'GEMINI_API_KEY is not configured for embeddings');
    }

    const payload = {
      requests: texts.map((text) => ({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      })),
    };

    const res = await fetch(`${this.baseUrl}/models/text-embedding-004:batchEmbedContents?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new ProviderUnavailableError(this.id, `Gemini Batch Embedding HTTP ${res.status}: ${errorText.slice(0, 150)}`);
    }

    const data = (await res.json()) as {
      embeddings?: Array<{
        values?: number[];
      }>;
    };

    return (data.embeddings || []).map((e) => e.values || []);
  }
}
