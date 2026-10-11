import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GroqProvider } from '../dist/providers/groq.js';
import { ProviderUnavailableError } from '../dist/errors/base.js';

describe('Groq Cloud Provider Adapter', () => {
  it('reports MISCONFIGURED status when apiKey is missing', async () => {
    const provider = new GroqProvider({ apiKey: undefined });
    const health = await provider.healthCheck();

    assert.strictEqual(health.status, 'MISCONFIGURED');
    assert.ok(health.message?.includes('GROQ_API_KEY is not set'));
  });

  it('rejects generate requests when apiKey is missing', async () => {
    const provider = new GroqProvider({ apiKey: undefined });

    await assert.rejects(
      async () => {
        await provider.generate({
          modelId: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'test' }],
        });
      },
      (err: any) => {
        assert.ok(err instanceof ProviderUnavailableError);
        assert.ok(err.message.includes('GROQ_API_KEY is not configured'));
        return true;
      }
    );
  });

  it('returns verified free tier models with 0 cost', async () => {
    const provider = new GroqProvider({ apiKey: 'mock-key' });
    const models = await provider.listModels();

    assert.ok(models.length >= 2);
    for (const m of models) {
      assert.strictEqual(m.isFree, true);
      assert.strictEqual(m.costPer1kInputTokens, 0.0);
      assert.strictEqual(m.costPer1kOutputTokens, 0.0);
      assert.strictEqual(m.isLocal, false);
      assert.strictEqual(m.privacyClass, 'PUBLIC_CLOUD');
    }
  });
});
