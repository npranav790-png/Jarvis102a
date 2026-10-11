import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ProviderRegistry } from '../dist/providers/registry.js';
import { ModelRegistry } from '../dist/providers/model-registry.js';
import { ModelRouter } from '../dist/providers/router.js';
import { MockAIProvider } from '../dist/providers/mock.js';
import { OpenRouterProvider } from '../dist/providers/openrouter.js';
import { CostLimitExceededError, ConfigurationError } from '../dist/errors/base.js';
import { loadConfig } from '../dist/config/config.js';

describe('Zero-Cost Hard Policy Enforcement (₹0 / $0 Guarantee)', () => {
  it('blocks registration of paid AI providers at registry boundary', () => {
    const registry = new ProviderRegistry(false, 0.0);

    const paidProvider = {
      id: 'paid-openai',
      name: 'Paid OpenAI',
      isPaid: true,
      isLocal: false,
      healthCheck: async () => ({ status: 'ONLINE' as const, lastChecked: '' }),
      listModels: async () => [],
      generate: async () => ({} as any),
      stream: async function* () {},
      getCapabilities: () => ({} as any),
    };

    assert.throws(() => {
      registry.register(paidProvider);
    }, CostLimitExceededError);
  });

  it('filters out paid models from the model registry', async () => {
    const providerRegistry = new ProviderRegistry(false, 0.0);
    const mock = new MockAIProvider({
      models: [
        {
          id: 'free-model',
          providerId: 'mock-provider',
          name: 'Free Model',
          contextWindow: 4096,
          supportsTools: true,
          supportsStreaming: true,
          supportsJson: true,
          capabilities: ['GENERAL'],
          costPer1kInputTokens: 0.0,
          costPer1kOutputTokens: 0.0,
          isFree: true,
          isLocal: true,
          speedClass: 'FAST',
          privacyClass: 'LOCAL',
          availability: 'AVAILABLE',
        },
        {
          id: 'paid-model',
          providerId: 'mock-provider',
          name: 'Paid Model',
          contextWindow: 4096,
          supportsTools: true,
          supportsStreaming: true,
          supportsJson: true,
          capabilities: ['GENERAL'],
          costPer1kInputTokens: 0.01, // Incurs cost!
          costPer1kOutputTokens: 0.03,
          isFree: false,
          isLocal: false,
          speedClass: 'FAST',
          privacyClass: 'PUBLIC_CLOUD',
          availability: 'AVAILABLE',
        },
      ],
    });

    providerRegistry.register(mock);
    const modelRegistry = new ModelRegistry(providerRegistry, false);
    const models = await modelRegistry.getAvailableModels();

    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].id, 'free-model');
  });

  it('router never selects non-free models and marks decisions FREE_VERIFIED', async () => {
    const providerRegistry = new ProviderRegistry(false, 0.0);
    providerRegistry.register(new MockAIProvider());
    const modelRegistry = new ModelRegistry(providerRegistry, false);
    const router = new ModelRouter(modelRegistry, providerRegistry);

    const decision = await router.route({ taskType: 'GENERAL' });
    assert.strictEqual(decision.costStatus, 'FREE_VERIFIED');
  });

  it('rejects OpenRouter requests attempting to target paid model without :free suffix', async () => {
    const openrouter = new OpenRouterProvider({ apiKey: 'mock-key' });

    await assert.rejects(async () => {
      await openrouter.generate({
        modelId: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
      });
    }, CostLimitExceededError);
  });

  it('rejects configuration attempting to allow paid providers when cost limit is 0', () => {
    assert.throws(() => {
      loadConfig(undefined, {
        cost: {
          allowPaidProviders: false,
          maxCostPerDay: 10.0, // Inconsistent!
        },
      });
    }, ConfigurationError);
  });
});
