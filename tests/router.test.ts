import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ModelRouter } from '../dist/providers/router.js';
import { ModelRegistry } from '../dist/providers/model-registry.js';
import { ProviderRegistry } from '../dist/providers/registry.js';
import { MockAIProvider } from '../dist/providers/mock.js';
import { GroqProvider } from '../dist/providers/groq.js';
import { OllamaProvider } from '../dist/providers/ollama.js';
import { ProviderUnavailableError } from '../dist/errors/base.js';

describe('Capability-Aware Hybrid Model Router', () => {
  function setupRouter(privacyMode: any = 'PREFER_LOCAL') {
    const providerRegistry = new ProviderRegistry(false, 0.0);
    const mock = new MockAIProvider();
    const groq = new GroqProvider({ apiKey: 'mock-key' });

    providerRegistry.register(mock);
    providerRegistry.register(groq);

    const modelRegistry = new ModelRegistry(providerRegistry, false);
    const router = new ModelRouter(modelRegistry, providerRegistry, {
      defaultPrivacyMode: privacyMode,
      providerPriority: ['groq', 'mock-provider'],
    });

    return { router, modelRegistry, providerRegistry };
  }

  it('selects coding-specialized model for CODING task', async () => {
    const { router } = setupRouter();
    const decision = await router.route({
      taskType: 'CODING',
      privacyMode: 'ALLOW_CLOUD',
    });

    assert.ok(decision.selectedModelId);
    assert.strictEqual(decision.costStatus, 'FREE_VERIFIED');
    assert.ok(decision.reason.includes('coding'));
    assert.ok(decision.candidates.length > 1);
    assert.ok(decision.fallbackChain.length > 0);
  });

  it('enforces LOCAL_ONLY privacy mode: strictly disqualifies cloud providers', async () => {
    const { router } = setupRouter();
    const decision = await router.route({
      taskType: 'GENERAL',
      privacyMode: 'LOCAL_ONLY',
    });

    assert.strictEqual(decision.selectedProviderId, 'mock-provider');
    // Ensure no cloud models are in candidate list or fallback chain
    for (const fb of decision.fallbackChain) {
      assert.notStrictEqual(fb.providerId, 'groq');
    }
    const cloudRejection = decision.rejectedCandidates.find((r) => r.reason.includes('LOCAL_ONLY'));
    assert.ok(cloudRejection, 'Should have rejected cloud models under LOCAL_ONLY');
  });

  it('disqualifies models lacking required tool support', async () => {
    const { router, modelRegistry } = setupRouter();
    const decision = await router.route({
      taskType: 'GENERAL',
      requireTools: true,
    });

    const selected = await modelRegistry.getModel(decision.selectedProviderId, decision.selectedModelId);
    assert.strictEqual(selected?.supportsTools, true);
  });

  it('bypasses rate-limited models and falls back to healthy candidates', async () => {
    const { router, modelRegistry } = setupRouter();

    // Mark top candidate as rate limited
    modelRegistry.updateModelAvailability('groq', 'llama-3.3-70b-versatile', 'RATE_LIMITED');

    const decision = await router.route({
      taskType: 'CODING',
      privacyMode: 'ALLOW_CLOUD',
    });

    // Should NOT select the rate-limited model
    assert.notStrictEqual(decision.selectedModelId, 'llama-3.3-70b-versatile');
    const rejected = decision.rejectedCandidates.find((r) => r.modelId === 'llama-3.3-70b-versatile');
    assert.ok(rejected?.reason.includes('rate_limited'));
  });

  it('throws ProviderUnavailableError when no candidates satisfy constraints', async () => {
    const { router } = setupRouter();

    await assert.rejects(
      async () => {
        await router.route({
          taskType: 'GENERAL',
          minContextWindow: 999999999, // Exceeds all models
        });
      },
      ProviderUnavailableError
    );
  });

  it('routes to local Qwen 3.5 8B when PREFER_LOCAL and preferredModel is configured', async () => {
    const providerRegistry = new ProviderRegistry(false, 0.0);
    const ollama = new OllamaProvider();
    ollama.healthCheck = async () => ({ status: 'ONLINE', latencyMs: 5, lastChecked: new Date().toISOString() });
    const groq = new GroqProvider({ apiKey: 'mock-key' });
    groq.healthCheck = async () => ({ status: 'ONLINE', latencyMs: 20, lastChecked: new Date().toISOString() });

    providerRegistry.register(ollama);
    providerRegistry.register(groq);

    const modelRegistry = new ModelRegistry(providerRegistry, false);
    await modelRegistry.refresh();

    const router = new ModelRouter(modelRegistry, providerRegistry, {
      defaultPrivacyMode: 'PREFER_LOCAL',
      preferredModel: 'qwen3.5:8b',
    });

    const decision = await router.route({
      taskType: 'CODING',
      privacyMode: 'PREFER_LOCAL',
    });

    assert.strictEqual(decision.selectedProviderId, 'ollama');
    assert.strictEqual(decision.selectedModelId, 'qwen3.5:8b');
    assert.strictEqual(decision.costStatus, 'FREE_VERIFIED');
    assert.ok(decision.candidates.length > 0);
  });
});

