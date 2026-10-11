import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HuggingFaceProvider } from '../dist/providers/huggingface.js';
import { ProviderUnavailableError } from '../dist/errors/base.js';

describe('Hugging Face Provider Adapter', () => {
  it('reports MISCONFIGURED status when apiKey is missing', async () => {
    const provider = new HuggingFaceProvider({ apiKey: undefined });
    const health = await provider.healthCheck();

    assert.strictEqual(health.status, 'MISCONFIGURED');
    assert.ok(health.message?.includes('HUGGINGFACE_API_KEY is not configured'));
  });

  it('rejects execution when apiKey is missing', async () => {
    const provider = new HuggingFaceProvider({ apiKey: undefined });

    await assert.rejects(
      async () => {
        await provider.generate({
          modelId: 'Qwen/Qwen2.5-Coder-32B-Instruct',
          messages: [{ role: 'user', content: 'test' }],
        });
      },
      ProviderUnavailableError
    );
  });

  it('lists verified free serverless models', async () => {
    const provider = new HuggingFaceProvider();
    const models = await provider.listModels();

    assert.ok(models.length >= 2);
    for (const m of models) {
      assert.strictEqual(m.isFree, true);
      assert.strictEqual(m.costPer1kInputTokens, 0.0);
      assert.strictEqual(m.costPer1kOutputTokens, 0.0);
    }
  });
});
