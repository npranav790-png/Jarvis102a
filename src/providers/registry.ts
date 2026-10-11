import { IAIProvider, ModelDescriptor, ProviderHealth } from './types.js';
import { CostLimitExceededError, ProviderNotFoundError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';
import { JarvisConfig } from '../config/schema.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { GroqProvider } from './groq.js';
import { OpenRouterProvider } from './openrouter.js';
import { HuggingFaceProvider } from './huggingface.js';
import { MockAIProvider } from './mock.js';

const logger = rootLogger.child('ProviderRegistry');

export class ProviderRegistry {
  private providers = new Map<string, IAIProvider>();
  private healthCache = new Map<string, { health: ProviderHealth; timestamp: number }>();
  private healthCacheTtlMs = 60000; // 1 minute

  constructor(
    private allowPaidProviders: boolean = false,
    private maxCostPerDay: number = 0.0,
    private eventBus?: EventBus
  ) {}

  public register(provider: IAIProvider): void {
    if (!this.allowPaidProviders && provider.isPaid) {
      throw new CostLimitExceededError(0.01, this.maxCostPerDay);
    }

    this.providers.set(provider.id, provider);
    logger.info(`AI Provider registered: ${provider.name} (${provider.id}) [paid=${provider.isPaid}, local=${provider.isLocal}]`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('provider:registered', 'ProviderRegistry', {
        providerId: provider.id,
        name: provider.name,
        isPaid: provider.isPaid,
        isLocal: provider.isLocal,
      }));
    }
  }

  public get(id: string): IAIProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderNotFoundError(id);
    }
    return provider;
  }

  public has(id: string): boolean {
    return this.providers.has(id);
  }

  public list(): IAIProvider[] {
    return Array.from(this.providers.values());
  }

  public async checkHealth(id: string, force: boolean = false): Promise<ProviderHealth> {
    const cached = this.healthCache.get(id);
    const now = Date.now();
    if (!force && cached && now - cached.timestamp < this.healthCacheTtlMs) {
      return cached.health;
    }

    const provider = this.get(id);
    try {
      const health = await provider.healthCheck();
      this.healthCache.set(id, { health, timestamp: now });
      if (this.eventBus) {
        this.eventBus.emit(createEvent('provider:health_checked', 'ProviderRegistry', {
          providerId: id,
          health,
        }));
      }
      return health;
    } catch (err) {
      const offlineHealth: ProviderHealth = {
        status: 'OFFLINE',
        message: (err as Error).message,
        lastChecked: new Date().toISOString(),
      };
      this.healthCache.set(id, { health: offlineHealth, timestamp: now });
      return offlineHealth;
    }
  }

  public async checkAllHealth(force: boolean = false): Promise<Record<string, ProviderHealth>> {
    const healthMap: Record<string, ProviderHealth> = {};
    for (const id of this.providers.keys()) {
      healthMap[id] = await this.checkHealth(id, force);
    }
    return healthMap;
  }

  /**
   * Initializes and registers all providers based on active configuration.
   * Real AI cloud providers only: Google Gemini, Groq, OpenRouter, Hugging Face.
   * Local models (Ollama) are excluded per cloud-only architectural policy.
   */
  public initializeFromConfig(config: JarvisConfig): void {
    const geminiKey = (config.providers as any).geminiApiKey || config.providers.googleAiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
    const geminiModel = (config.providers as any).geminiModel || process.env.GEMINI_MODEL || 'gemini-3.7-flash';

    // 0. Ollama Local Provider (enabled when privacy mode allows local, or when requested)
    const defaultModel = (config.providers as any).defaultModel || process.env.JARVIS_DEFAULT_MODEL || process.env.JARVIS_MODEL || '';
    const wantsLocalModel = /qwen|ollama|llama/i.test(defaultModel);
    const enableOllama =
      (config.privacy.mode !== 'CLOUD_ONLY' || process.env.JARVIS_ENABLE_OLLAMA === 'true' || wantsLocalModel) &&
      process.env.JARVIS_DISABLE_OLLAMA !== 'true';

    // In offline mode or in-memory tests without cloud key, register offline mock provider
    if (config.app.offline || (config.database.path === ':memory:' && !geminiKey)) {
      if (!this.has('mock-provider')) {
        this.register(new MockAIProvider());
      }
      if (config.app.offline) {
        if (enableOllama && !this.has('ollama')) {
          this.register(new OllamaProvider({
            baseUrl: config.providers.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          }));
        }
        logger.info('Offline mode active: Skipping external cloud AI providers.');
        return;
      }
    }

    if (enableOllama && !this.has('ollama')) {
      this.register(new OllamaProvider({
        baseUrl: config.providers.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      }));
    }

    // 1. Google Gemini (Cloud Flagship Provider)
    if (this.has('gemini')) {
      const existing = this.get('gemini') as GeminiProvider;
      if (typeof existing.setApiKey === 'function' && geminiKey) {
        existing.setApiKey(geminiKey);
      }
      if (typeof existing.setDefaultModel === 'function' && geminiModel) {
        existing.setDefaultModel(geminiModel);
      }
    } else {
      this.register(new GeminiProvider({
        apiKey: geminiKey,
        defaultModel: geminiModel,
      }));
    }

    // 2. Groq (Free Tier)
    if (this.has('groq')) {
      const existing = this.get('groq') as GroqProvider;
      if (typeof existing.setApiKey === 'function' && config.providers.groqApiKey) {
        existing.setApiKey(config.providers.groqApiKey);
      }
    } else {
      this.register(new GroqProvider({
        apiKey: config.providers.groqApiKey,
      }));
    }

    // 3. OpenRouter (Free Models)
    if (this.has('openrouter')) {
      const existing = this.get('openrouter') as OpenRouterProvider;
      if (typeof existing.setApiKey === 'function' && config.providers.openRouterApiKey) {
        existing.setApiKey(config.providers.openRouterApiKey);
      }
    } else {
      this.register(new OpenRouterProvider({
        apiKey: config.providers.openRouterApiKey,
      }));
    }

    // 4. Hugging Face Serverless
    if (this.has('huggingface')) {
      const existing = this.get('huggingface') as HuggingFaceProvider;
      if (typeof existing.setApiKey === 'function' && config.providers.huggingFaceApiKey) {
        existing.setApiKey(config.providers.huggingFaceApiKey);
      }
    } else {
      this.register(new HuggingFaceProvider({
        apiKey: config.providers.huggingFaceApiKey,
      }));
    }
  }
}

