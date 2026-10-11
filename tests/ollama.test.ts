import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OllamaProvider } from '../dist/providers/ollama.js';

describe('Ollama Provider Adapter', () => {
  it('instantiates with local-first and zero-cost defaults', () => {
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434' });
    assert.strictEqual(provider.id, 'ollama');
    assert.strictEqual(provider.isPaid, false);
    assert.strictEqual(provider.isLocal, true);
  });

  it('handles offline state gracefully without throwing', async () => {
    // Unreachable port to simulate offline Ollama
    const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:59999' });
    const health = await provider.healthCheck();

    assert.strictEqual(health.status, 'OFFLINE');
    assert.ok(health.message?.includes('not reachable') || health.message?.includes('fetch failed'));
  });

  it('provides known fallback models when daemon is offline', async () => {
    const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:59999' });
    const models = await provider.listModels();

    assert.ok(models.length > 0);
    for (const model of models) {
      assert.strictEqual(model.isFree, true);
      assert.strictEqual(model.isLocal, true);
      assert.strictEqual(model.costPer1kInputTokens, 0.0);
      assert.strictEqual(model.costPer1kOutputTokens, 0.0);
      assert.strictEqual(model.privacyClass, 'LOCAL');
    }
  });

  it('declares expected capabilities', () => {
    const provider = new OllamaProvider();
    const caps = provider.getCapabilities();
    assert.strictEqual(caps.supportsStreaming, true);
    assert.strictEqual(caps.supportsToolCalling, true);
    assert.strictEqual(caps.supportsStructuredOutput, true);
  });

  it('includes Qwen 3.5 8B and Qwen 2.5 variants with high coding/reasoning capabilities', async () => {
    const provider = new OllamaProvider();
    const models = await provider.listModels();
    const qwen35 = models.find((m) => m.id === 'qwen3.5:8b' || m.id === 'qwen3.5:9b');
    assert.ok(qwen35, 'qwen3.5 model must be present in known/installed models');
    assert.strictEqual(qwen35.providerId, 'ollama');
    assert.strictEqual(qwen35.qualitativeCapabilities?.coding, 'HIGH');
    assert.strictEqual(qwen35.qualitativeCapabilities?.reasoning, 'HIGH');
    assert.strictEqual(qwen35.contextWindow, 32768);
    assert.strictEqual(qwen35.isFree, true);
    assert.strictEqual(qwen35.isLocal, true);

    const hasQwen = models.some((m) => m.id.includes('qwen'));
    assert.ok(hasQwen, 'Qwen model must be present in models list');
  });
});

