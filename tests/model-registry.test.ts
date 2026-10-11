import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ModelRegistry } from '../dist/providers/model-registry.js';
import { ProviderRegistry } from '../dist/providers/registry.js';
import { MockAIProvider } from '../dist/providers/mock.js';

describe('Model Registry', () => {
  it('aggregates models and filters out paid models', async () => {
    const providerRegistry = new ProviderRegistry(false, 0.0);
    const mock = new MockAIProvider();
    providerRegistry.register(mock);

    const modelRegistry = new ModelRegistry(providerRegistry, false);
    const models = await modelRegistry.getAvailableModels();

    assert.ok(models.length >= 2);
    assert.strictEqual(models.every((m) => m.isFree), true);
    assert.strictEqual(models.every((m) => m.costPer1kInputTokens === 0), true);
  });

  it('supports caching and availability updates', async () => {
    const providerRegistry = new ProviderRegistry(false, 0.0);
    const mock = new MockAIProvider();
    providerRegistry.register(mock);

    const modelRegistry = new ModelRegistry(providerRegistry, false);
    await modelRegistry.getAvailableModels();

    modelRegistry.updateModelAvailability('mock-provider', 'mock-llama-3-8b', 'RATE_LIMITED');
    const updated = await modelRegistry.getModel('mock-provider', 'mock-llama-3-8b');

    assert.strictEqual(updated?.availability, 'RATE_LIMITED');
  });

  it('filters models by capability and privacy mode', async () => {
    const providerRegistry = new ProviderRegistry(false, 0.0);
    providerRegistry.register(new MockAIProvider());

    const modelRegistry = new ModelRegistry(providerRegistry, false);
    const codingModels = await modelRegistry.listModels({ capability: 'CODING' });

    assert.ok(codingModels.length > 0);
    assert.ok(codingModels.every((m) => m.capabilities.includes('CODING')));

    const localModels = await modelRegistry.listModels({ privacyMode: 'LOCAL_ONLY' });
    assert.ok(localModels.every((m) => m.isLocal));
  });
});
