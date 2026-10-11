import { ModelDescriptor, ModelCapability, PrivacyMode, ModelAvailability } from './types.js';
import { ProviderRegistry } from './registry.js';
import { rootLogger } from '../logging/logger.js';

import { EventBus } from '../events/bus.js';

const logger = rootLogger.child('ModelRegistry');

export interface ModelFilterOptions {
  providerId?: string;
  isFreeOnly?: boolean;
  isLocalOnly?: boolean;
  capability?: ModelCapability;
  privacyMode?: PrivacyMode;
}

export class ModelRegistry {
  private cache: Map<string, ModelDescriptor> = new Map();
  private availabilityOverrides: Map<string, ModelAvailability> = new Map();
  private lastRefreshed = 0;
  private cacheTtlMs = 300000; // 5 minutes

  constructor(
    private providerRegistry: ProviderRegistry,
    private allowPaidProviders: boolean = false,
    private eventBus?: EventBus
  ) {
    if (this.eventBus) {
      this.eventBus.subscribe('provider:registered', () => {
        this.clearCache();
      });
    }
  }

  public async getAvailableModels(forceRefresh: boolean = false): Promise<ModelDescriptor[]> {
    const now = Date.now();
    if (!forceRefresh && this.cache.size > 0 && now - this.lastRefreshed < this.cacheTtlMs) {
      return Array.from(this.cache.values());
    }

    await this.refresh();
    return Array.from(this.cache.values());
  }

  public async refresh(): Promise<void> {
    logger.debug('Refreshing models from registered providers...');
    const providers = this.providerRegistry.list();
    const newCache = new Map<string, ModelDescriptor>();

    for (const provider of providers) {
      try {
        const health = await this.providerRegistry.checkHealth(provider.id);
        const models = await provider.listModels();
        for (const model of models) {
          // Zero-cost policy guard
          if (!this.allowPaidProviders && !model.isFree) {
            logger.warn(`Filtering out paid model: ${model.id} from ${provider.id}`);
            continue;
          }

          const key = `${provider.id}:${model.id}`;
          const availabilityOverride = this.availabilityOverrides.get(key);
          let availability = availabilityOverride || model.availability;

          // Align availability with provider operational health if no explicit override exists
          if (!availabilityOverride) {
            if (health.status === 'OFFLINE' || health.status === 'MISCONFIGURED') {
              availability = 'UNAVAILABLE';
            } else if (health.status === 'RATE_LIMITED') {
              availability = 'RATE_LIMITED';
            }
          }

          newCache.set(key, {
            ...model,
            providerId: provider.id,
            availability,
          });
        }
      } catch (err) {
        logger.warn(`Failed to retrieve models from provider ${provider.id}`, undefined, err as Error);
      }
    }

    this.cache = newCache;
    this.lastRefreshed = Date.now();
    logger.info(`Discovered ${this.cache.size} verified free models across ${providers.length} providers.`);
  }

  public async findModel(modelId: string): Promise<ModelDescriptor | null> {
    const models = await this.getAvailableModels();
    return models.find((m) => m.id === modelId) || null;
  }

  public async getModel(providerId: string, modelId: string): Promise<ModelDescriptor | null> {
    const models = await this.getAvailableModels();
    return models.find((m) => m.providerId === providerId && m.id === modelId) || null;
  }

  public updateModelAvailability(providerId: string, modelId: string, availability: ModelAvailability): void {
    const key = `${providerId}:${modelId}`;
    this.availabilityOverrides.set(key, availability);

    const existing = this.cache.get(key);
    if (existing) {
      existing.availability = availability;
      this.cache.set(key, existing);
    }
    logger.debug(`Updated availability override for ${key} -> ${availability}`);
  }

  public async listModels(filters: ModelFilterOptions = {}): Promise<ModelDescriptor[]> {
    let models = await this.getAvailableModels();

    if (filters.providerId) {
      models = models.filter((m) => m.providerId === filters.providerId);
    }

    if (filters.isFreeOnly ?? true) {
      models = models.filter((m) => m.isFree && m.costPer1kInputTokens === 0 && m.costPer1kOutputTokens === 0);
    }

    if (filters.isLocalOnly || filters.privacyMode === 'LOCAL_ONLY') {
      models = models.filter((m) => m.isLocal);
    }

    if (filters.capability) {
      models = models.filter((m) => m.capabilities.includes(filters.capability!));
    }

    return models;
  }

  public clearCache(): void {
    this.cache.clear();
    this.availabilityOverrides.clear();
    this.lastRefreshed = 0;
  }
}
