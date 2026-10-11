import {
  GenerateRequest,
  GenerateResponse,
  StreamChunk,
  TaskRoutingRequest,
  RoutingDecision,
  IAIProvider,
} from './types.js';
import { ModelRouter } from './router.js';
import { ProviderRegistry } from './registry.js';
import { ModelRegistry } from './model-registry.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { ProviderUnavailableError, ValidationError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('AIService');

export interface AIGenerateRequest extends GenerateRequest {
  routing?: TaskRoutingRequest;
}

export interface AIGenerateResult extends GenerateResponse {
  providerId: string;
  modelId: string;
  fallbackCount: number;
}

export class AIService {
  constructor(
    private router: ModelRouter,
    private providerRegistry: ProviderRegistry,
    private modelRegistry: ModelRegistry,
    private eventBus?: EventBus
  ) {}

  public async route(routingRequest: TaskRoutingRequest): Promise<RoutingDecision> {
    return this.router.route(routingRequest);
  }

  public async generate(request: AIGenerateRequest): Promise<AIGenerateResult> {
    const routingReq = request.routing || {
      taskType: 'GENERAL',
      requireTools: !!(request.tools && request.tools.length > 0),
      requireJson: !!(request.responseFormat?.type === 'json' || request.jsonSchema),
    };

    const decision = await this.router.route(routingReq);
    const chain = [
      { providerId: decision.selectedProviderId, modelId: decision.selectedModelId },
      ...decision.fallbackChain,
    ];

    let lastError: Error | null = null;
    let fallbackCount = 0;

    for (const candidate of chain) {
      try {
        const provider = this.providerRegistry.get(candidate.providerId);
        logger.info(`Executing generation with [${candidate.providerId}] ${candidate.modelId}`);

        const candidateReq: GenerateRequest = {
          ...request,
          modelId: candidate.modelId,
        };

        const response = await provider.generate(candidateReq);

        // 1. Structured JSON validation if requested
        if (request.responseFormat?.type === 'json' || request.jsonSchema) {
          this.validateJsonOutput(response.content, request.jsonSchema);
        }

        // 2. Emit success event
        if (this.eventBus) {
          this.eventBus.emit(
            createEvent('ai:generated', 'AIService', {
              providerId: candidate.providerId,
              modelId: candidate.modelId,
              tokens: response.usage.totalTokens,
              cost: response.usage.estimatedCostUSD,
              finishReason: response.finishReason,
            })
          );
        }

        return {
          ...response,
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          fallbackCount,
        };
      } catch (err) {
        lastError = err as Error;
        fallbackCount++;
        logger.warn(
          `Candidate [${candidate.providerId}] ${candidate.modelId} failed: ${(err as Error).message}. Attempting fallback...`
        );

        // Update health in model registry
        if ((err as Error).message.includes('429') || (err as Error).message.includes('rate limit')) {
          this.modelRegistry.updateModelAvailability(candidate.providerId, candidate.modelId, 'RATE_LIMITED');
        } else {
          this.modelRegistry.updateModelAvailability(candidate.providerId, candidate.modelId, 'DEGRADED');
        }

        if (this.eventBus) {
          this.eventBus.emit(
            createEvent('provider:fallback_triggered', 'AIService', {
              failedProvider: candidate.providerId,
              failedModel: candidate.modelId,
              error: (err as Error).message,
              remainingFallbacks: chain.length - fallbackCount,
            })
          );
        }
      }
    }

    throw new ProviderUnavailableError(
      'AIService',
      `All ${chain.length} AI provider candidates in fallback chain failed. Last error: ${lastError?.message || 'Unknown'}`
    );
  }

  public async *stream(request: AIGenerateRequest): AsyncIterable<StreamChunk> {
    const routingReq = request.routing || {
      taskType: 'GENERAL',
      requireStreaming: true,
      requireTools: !!(request.tools && request.tools.length > 0),
    };

    const decision = await this.router.route(routingReq);
    const chain = [
      { providerId: decision.selectedProviderId, modelId: decision.selectedModelId },
      ...decision.fallbackChain,
    ];

    let lastError: Error | null = null;

    for (const candidate of chain) {
      try {
        const provider = this.providerRegistry.get(candidate.providerId);
        logger.info(`Starting stream with [${candidate.providerId}] ${candidate.modelId}`);

        const candidateReq: GenerateRequest = {
          ...request,
          modelId: candidate.modelId,
        };

        for await (const chunk of provider.stream(candidateReq)) {
          yield chunk;
        }

        // Successfully finished stream
        return;
      } catch (err) {
        lastError = err as Error;
        logger.warn(
          `Stream candidate [${candidate.providerId}] ${candidate.modelId} failed: ${(err as Error).message}. Cascading fallback...`
        );
        this.modelRegistry.updateModelAvailability(candidate.providerId, candidate.modelId, 'DEGRADED');
      }
    }

    throw new ProviderUnavailableError(
      'AIService',
      `All streaming candidates failed in fallback chain. Last error: ${lastError?.message || 'Unknown'}`
    );
  }

  private validateJsonOutput(content: string, schema?: Record<string, unknown>): void {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new ValidationError('AI response is valid JSON primitive but not a JSON object.');
      }
    } catch (err) {
      throw new ValidationError(`AI response is not valid JSON: ${(err as Error).message}`);
    }
  }
}
