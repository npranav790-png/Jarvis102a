import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OpenRouterProvider } from '../dist/providers/openrouter.js';
import { CostLimitExceededError, ProviderUnavailableError } from '../dist/errors/base.js';

describe('OpenRouter Provider Adapter', () => {
  it('reports MISCONFIGURED status when apiKey is missing', async () => {
    const provider = new OpenRouterProvider({ apiKey: undefined });
    const health = await provider.healthCheck();

    assert.strictEqual(health.status, 'MISCONFIGURED');
    assert.ok(health.message?.includes('OPENROUTER_API_KEY is not set'));
  });

  it('strictly blocks paid models without :free suffix', async () => {
    const provider = new OpenRouterProvider({ apiKey: 'sk-or-mock' });

    // Attempting to route a non-free model: must throw CostLimitExceededError
    await assert.rejects(
      async () => {
        await provider.generate({
          modelId: 'anthropic/claude-3-opus', // Paid model without :free
          messages: [{ role: 'user', content: 'hello' }],
        });
      },
      CostLimitExceededError
    );
  });

  it('allows verified free models with :free suffix and 0 cost', async () => {
    const provider = new OpenRouterProvider({ apiKey: 'sk-or-mock' });
    const models = await provider.listModels();

    assert.ok(models.length >= 2);
    for (const m of models) {
      assert.ok(m.id.endsWith(':free'));
      assert.strictEqual(m.isFree, true);
      assert.strictEqual(m.costPer1kInputTokens, 0.0);
      assert.strictEqual(m.costPer1kOutputTokens, 0.0);
    }
  });
});
