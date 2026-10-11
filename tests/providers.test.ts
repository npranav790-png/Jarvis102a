import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ProviderRegistry } from '../dist/providers/registry.js';
import { MockAIProvider } from '../dist/providers/mock.js';
import type { IAIProvider } from '../dist/providers/types.js';
import { CostLimitExceededError } from '../dist/errors/base.js';

describe('AI Provider Abstraction & Zero-Cost Guardrails', () => {
  it('registers free mock provider and executes zero-cost generation', async () => {
    const registry = new ProviderRegistry(false, 0.0);
    const mock = new MockAIProvider();
    registry.register(mock);

    const provider = registry.get('mock-provider');
    const health = await provider.healthCheck();
    assert.strictEqual(health.status, 'ONLINE');

    const response = await provider.generate({
      modelId: 'mock-llama-3-8b',
      messages: [{ role: 'user', content: 'Hello Jarvis' }],
    });

    assert.ok(response.content.includes('Hello Jarvis') || response.content.includes('Good day'));
    assert.strictEqual(response.usage.estimatedCostUSD, 0.0);
  });

  it('supports streaming response chunks', async () => {
    const mock = new MockAIProvider();
    const chunks: string[] = [];

    for await (const chunk of mock.stream({
      modelId: 'mock-llama-3-8b',
      messages: [{ role: 'user', content: 'Stream test' }],
    })) {
      if (chunk.delta) {
        chunks.push(chunk.delta);
      }
    }

    assert.ok(chunks.length > 0);
  });

  it('strictly blocks paid providers when allowPaidProviders is false', () => {
    const registry = new ProviderRegistry(false, 0.0); // Zero-cost enforced

    const paidProvider: IAIProvider = {
      id: 'paid-openai',
      name: 'Paid OpenAI',
      isPaid: true,
      isLocal: false,
      healthCheck: async () => ({ status: 'ONLINE', lastChecked: '' }),
      listModels: async () => [],
      generate: async () => ({} as any),
      stream: async function* () {},
      getCapabilities: () => ({} as any),
    };

    assert.throws(() => {
      registry.register(paidProvider);
    }, CostLimitExceededError);
  });
});
