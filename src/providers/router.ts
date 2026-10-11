import {
  TaskRoutingRequest,
  RoutingDecision,
  CandidateScore,
  ModelDescriptor,
  PrivacyMode,
  AITaskType,
} from './types.js';
import { ModelRegistry } from './model-registry.js';
import { ProviderRegistry } from './registry.js';
import { ProviderUnavailableError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('ModelRouter');

export interface RouterOptions {
  defaultPrivacyMode?: PrivacyMode;
  providerPriority?: string[];
  offlineMode?: boolean;
  preferredModel?: string;
}

export class ModelRouter {
  private defaultPrivacyMode: PrivacyMode;
  private providerPriority: string[];
  private offlineMode: boolean;
  private preferredModel?: string;

  constructor(
    private modelRegistry: ModelRegistry,
    private providerRegistry: ProviderRegistry,
    options: RouterOptions = {}
  ) {
    this.defaultPrivacyMode = options.defaultPrivacyMode || 'ALLOW_CLOUD';
    this.providerPriority = options.providerPriority || ['gemini', 'groq', 'openrouter', 'huggingface'];
    this.offlineMode = options.offlineMode || false;
    this.preferredModel = options.preferredModel || process.env.JARVIS_DEFAULT_MODEL || process.env.JARVIS_MODEL;
  }

  public setOfflineMode(offline: boolean): void {
    this.offlineMode = offline;
  }

  public setPrivacyMode(mode: PrivacyMode): void {
    this.defaultPrivacyMode = mode;
  }

  public setPreferredModel(model?: string): void {
    this.preferredModel = model;
  }

  public getPreferredModel(): string | undefined {
    return this.preferredModel;
  }

  public async route(request: TaskRoutingRequest): Promise<RoutingDecision> {
    const privacyMode = this.offlineMode ? 'LOCAL_ONLY' : (request.privacyMode || this.defaultPrivacyMode);
    logger.debug(`Evaluating routing for task=${request.taskType}, privacyMode=${privacyMode}`);

    const allModels = await this.modelRegistry.getAvailableModels();
    const candidateScores: CandidateScore[] = [];
    const rejectedCandidates: Array<{ modelId: string; reason: string }> = [];

    for (const model of allModels) {
      // 1. HARD FILTER: Zero-Cost Policy
      if (!model.isFree || model.costPer1kInputTokens > 0 || model.costPer1kOutputTokens > 0) {
        rejectedCandidates.push({
          modelId: model.id,
          reason: 'Zero-cost violation: Model is not free or incurs per-token charges.',
        });
        continue;
      }

      // 2. HARD FILTER: Ollama is disabled under CLOUD_ONLY or when explicitly disabled
      if (model.providerId === 'ollama' && (privacyMode === 'CLOUD_ONLY' || process.env.JARVIS_DISABLE_OLLAMA === 'true')) {
        rejectedCandidates.push({
          modelId: model.id,
          reason: 'Ollama is disabled: Cloud-only architecture enforced.',
        });
        continue;
      }

      // 3. HARD FILTER: Offline & Privacy Policy
      if (this.offlineMode && !model.isLocal) {
        rejectedCandidates.push({
          modelId: model.id,
          reason: 'Offline mode active: Cloud model excluded.',
        });
        continue;
      }

      if (privacyMode === 'CLOUD_ONLY' && model.isLocal && model.providerId !== 'mock-provider') {
        rejectedCandidates.push({
          modelId: model.id,
          reason: 'Cloud-only routing policy: Local models are excluded.',
        });
        continue;
      }

      if (privacyMode === 'LOCAL_ONLY' && !model.isLocal) {
        rejectedCandidates.push({
          modelId: model.id,
          reason: 'Privacy policy violation: Cloud model rejected under LOCAL_ONLY mode.',
        });
        continue;
      }

      // 3. HARD FILTER: Tool requirements
      if (request.requireTools && !model.supportsTools) {
        rejectedCandidates.push({
          modelId: model.id,
          reason: 'Capability mismatch: Tool support required but not supported by model.',
        });
        continue;
      }

      // 4. HARD FILTER: Structured JSON requirements
      if (request.requireJson && !model.supportsJson) {
        rejectedCandidates.push({
          modelId: model.id,
          reason: 'Capability mismatch: Structured JSON required but not supported.',
        });
        continue;
      }

      // 5. HARD FILTER: Streaming requirements
      if (request.requireStreaming && !model.supportsStreaming) {
        rejectedCandidates.push({
          modelId: model.id,
          reason: 'Capability mismatch: Streaming required but not supported.',
        });
        continue;
      }

      // 6. HARD FILTER: Minimum Context Window
      if (request.minContextWindow && model.contextWindow < request.minContextWindow) {
        rejectedCandidates.push({
          modelId: model.id,
          reason: `Context fit mismatch: Requires ${request.minContextWindow} tokens, model has ${model.contextWindow}.`,
        });
        continue;
      }

      // 7. HARD FILTER: Model Availability / Rate Limit
      if (model.availability === 'RATE_LIMITED' || model.availability === 'UNAVAILABLE') {
        rejectedCandidates.push({
          modelId: model.id,
          reason: `Model is currently ${model.availability.toLowerCase()}.`,
        });
        continue;
      }

      // 8. SCORING
      const { score, breakdown } = this.calculateScore(model, request, privacyMode);

      candidateScores.push({
        providerId: model.providerId,
        modelId: model.id,
        score,
        breakdown,
        isEligible: true,
      });
    }

    if (candidateScores.length === 0) {
      const errorMsg = `No eligible free AI models found for task '${request.taskType}' under privacy mode '${privacyMode}'. (Rejected: ${rejectedCandidates.length} models)`;
      logger.error(errorMsg);
      throw new ProviderUnavailableError('router', errorMsg);
    }

    // Sort candidate scores descending
    candidateScores.sort((a, b) => b.score - a.score);

    const winner = candidateScores[0];
    const winnerModel = allModels.find(m => m.providerId === winner.providerId && m.id === winner.modelId);
    const winnerIsCloud = winnerModel ? !winnerModel.isLocal : true;

    // Fallback rule: under CLOUD_ONLY, local models and Ollama are strictly excluded from fallbacks
    const fallbackChain = candidateScores
      .slice(1)
      .filter((c) => {
        if (privacyMode === 'CLOUD_ONLY') {
          const m = allModels.find(mod => mod.providerId === c.providerId && mod.id === c.modelId);
          return m ? !m.isLocal && m.providerId !== 'ollama' : c.providerId !== 'ollama';
        }
        if (winnerIsCloud && privacyMode === 'CLOUD_PREFERRED') {
          return c.providerId !== 'ollama';
        }
        return true;
      })
      .map((c) => ({
        providerId: c.providerId,
        modelId: c.modelId,
      }));

    const reason = this.buildExplanation(winner, request, privacyMode);

    logger.info(
      `Router selected [${winner.providerId}] ${winner.modelId} (score=${winner.score}) for ${request.taskType}. Fallbacks: ${fallbackChain.length}`
    );

    return {
      selectedProviderId: winner.providerId,
      selectedModelId: winner.modelId,
      reason,
      candidates: candidateScores,
      rejectedCandidates,
      fallbackChain,
      privacyMode,
      costStatus: 'FREE_VERIFIED',
    };
  }

  private calculateScore(
    model: ModelDescriptor,
    request: TaskRoutingRequest,
    privacyMode: PrivacyMode
  ): { score: number; breakdown: Record<string, number> } {
    const breakdown: Record<string, number> = {};
    let total = 50; // Base score for any eligible free model
    breakdown['baseScore'] = 50;

    // 1. Task-Specific Capability Matching
    switch (request.taskType) {
      case 'CODING':
        if (model.capabilities.includes('CODING')) {
          const rating = model.qualitativeCapabilities?.coding || 'MEDIUM';
          const bonus = rating === 'HIGH' ? 40 : rating === 'MEDIUM' ? 25 : 10;
          total += bonus;
          breakdown['codingCapability'] = bonus;
        }
        break;

      case 'REASONING':
      case 'ANALYSIS':
        if (model.capabilities.includes('REASONING')) {
          const rating = model.qualitativeCapabilities?.reasoning || 'MEDIUM';
          const bonus = rating === 'HIGH' ? 40 : rating === 'MEDIUM' ? 25 : 10;
          total += bonus;
          breakdown['reasoningCapability'] = bonus;
        }
        break;

      case 'RESEARCH':
      case 'SUMMARIZATION':
        if (model.capabilities.includes('LONG_CONTEXT') || model.contextWindow >= 32000) {
          total += 25;
          breakdown['longContext'] = 25;
        }
        if (model.capabilities.includes('RESEARCH')) {
          total += 20;
          breakdown['researchCapability'] = 20;
        }
        break;

      case 'FAST':
        if (model.speedClass === 'FAST') {
          total += 35;
          breakdown['speedClassFast'] = 35;
        }
        break;

      default:
        if (model.capabilities.includes('GENERAL')) {
          total += 15;
          breakdown['generalCapability'] = 15;
        }
        break;
    }

    // 2. Privacy Mode Preferences
    if (privacyMode === 'PREFER_LOCAL' && model.isLocal) {
      total += 25;
      breakdown['preferLocalBonus'] = 25;
    } else if ((privacyMode === 'CLOUD_PREFERRED' || privacyMode === 'CLOUD_ONLY') && !model.isLocal) {
      total += 35;
      breakdown['cloudPreferredBonus'] = 35;
    }

    // 3. User-Configured Provider Priority
    const priorityIndex = this.providerPriority.indexOf(model.providerId.toLowerCase());
    if (priorityIndex !== -1) {
      const priorityBonus = Math.max(0, 15 - priorityIndex * 4);
      total += priorityBonus;
      breakdown['providerPriority'] = priorityBonus;
    }

    // 4. Preferred Provider / Model Specific Request
    if (request.preferredProvider && model.providerId.toLowerCase() === request.preferredProvider.toLowerCase()) {
      total += 30;
      breakdown['userPreferredProvider'] = 30;
    }
    const preferredModel = request.preferredModel || this.preferredModel;
    if (preferredModel) {
      const p = preferredModel.toLowerCase();
      const m = model.id.toLowerCase();
      if (m === p || m.includes(p) || p.includes(m)) {
        total += 50;
        breakdown['userPreferredModel'] = 50;
      }
    }

    // 5. Speed Class general weighting
    if (model.speedClass === 'FAST') {
      total += 10;
      breakdown['speedBonus'] = 10;
    }

    // 6. Availability Health
    if (model.availability === 'AVAILABLE') {
      total += 10;
      breakdown['healthyBonus'] = 10;
    } else if (model.availability === 'DEGRADED') {
      total -= 20;
      breakdown['degradedPenalty'] = -20;
    }

    return { score: total, breakdown };
  }

  private buildExplanation(
    winner: CandidateScore,
    request: TaskRoutingRequest,
    privacyMode: PrivacyMode
  ): string {
    const reasons: string[] = [
      `Selected [${winner.providerId}] '${winner.modelId}' (Score: ${winner.score}).`,
      `Classified as strictly free (₹0 / $0 target cost verified).`,
    ];

    if (privacyMode === 'LOCAL_ONLY') {
      reasons.push('Satisfies LOCAL_ONLY privacy policy: local execution confirmed.');
    }

    if (request.taskType === 'CODING') {
      reasons.push('Prioritized due to strong coding capability.');
    } else if (request.taskType === 'FAST') {
      reasons.push('Prioritized due to fast inference speed.');
    } else if (request.taskType === 'REASONING') {
      reasons.push('Prioritized for multi-step reasoning capabilities.');
    }

    return reasons.join(' ');
  }
}
