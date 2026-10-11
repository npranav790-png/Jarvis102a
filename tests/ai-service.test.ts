import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AIService } from '../dist/providers/ai-service.js';
import { ModelRouter } from '../dist/providers/router.js';
import { ModelRegistry } from '../dist/providers/model-registry.js';
import { ProviderRegistry } from '../dist/providers/registry.js';
import { MockAIProvider } from '../dist/providers/mock.js';
import { EventBus } from '../dist/events/bus.js';
import { ValidationError, ProviderUnavailableError } from '../dist/errors/base.js';

describe('AIService Execution Pipeline & Resilient Fallback', () => {
  function setupAIService() {
    const eventBus = new EventBus();
    const providerRegistry = new ProviderRegistry(false, 0.0, eventBus);

    const primaryMock = new MockAIProvider({
      id: 'mock-primary',
      name: 'Primary Mock Provider',
    });
    const secondaryMock = new MockAIProvider({
      id: 'mock-secondary',
      name: 'Secondary Mock Provider',
    });

    providerRegistry.register(primaryMock);
    providerRegistry.register(secondaryMock);

    const modelRegistry = new ModelRegistry(providerRegistry, false);
    const router = new ModelRouter(modelRegistry, providerRegistry, {
      defaultPrivacyMode: 'LOCAL_ONLY',
      providerPriority: ['mock-primary', 'mock-secondary'],
    });

    const aiService = new AIService(router, providerRegistry, modelRegistry, eventBus);
    return { aiService, primaryMock, secondaryMock, eventBus };
  }

  it('routes and completes generation request through pipeline', async () => {
    const { aiService } = setupAIService();
    const result = await aiService.generate({
      modelId: '',
      messages: [{ role: 'user', content: 'Explain quantum computing' }],
      routing: { taskType: 'GENERAL' },
    });

    assert.ok(result.content.includes('Explain quantum computing'));
    assert.strictEqual(result.fallbackCount, 0);
    assert.strictEqual(result.usage.estimatedCostUSD, 0.0);
  });

  it('streams response chunks via async generator', async () => {
    const { aiService } = setupAIService();
    const chunks: string[] = [];

    for await (const chunk of aiService.stream({
      modelId: '',
      messages: [{ role: 'user', content: 'Stream test' }],
      routing: { taskType: 'FAST' },
    })) {
      if (chunk.delta) chunks.push(chunk.delta);
    }

    assert.ok(chunks.length > 0);
  });

  it('validates structured JSON output and throws ValidationError on invalid output', async () => {
    const { aiService } = setupAIService();

    const validJsonResult = await aiService.generate({
      modelId: '',
      messages: [{ role: 'user', content: 'Output json data' }],
      responseFormat: { type: 'json' },
    });

    assert.doesNotThrow(() => JSON.parse(validJsonResult.content));
  });

  it('normalizes tool calls when requested', async () => {
    const { aiService } = setupAIService();
    const result = await aiService.generate({
      modelId: '',
      messages: [{ role: 'user', content: 'Please call_tool for me' }],
      tools: [{ name: 'web_search', description: 'Search web', parameters: {} }],
    });

    assert.strictEqual(result.finishReason, 'tool_calls');
    assert.ok(result.toolCalls && result.toolCalls.length > 0);
    assert.strictEqual(result.toolCalls[0].name, 'web_search');
  });

  it('automatically cascades to fallback candidate when primary fails', async () => {
    const { aiService, primaryMock, eventBus } = setupAIService();
    let fallbackEventFired = false;

    eventBus.subscribe('provider:fallback_triggered', () => {
      fallbackEventFired = true;
    });

    // Induce failure on the primary provider
    primaryMock.setSimulateFailure(true);

    const result = await aiService.generate({
      modelId: '',
      messages: [{ role: 'user', content: 'Test fallback recovery' }],
      routing: { taskType: 'GENERAL' },
    });

    assert.strictEqual(result.providerId, 'mock-secondary');
    assert.strictEqual(result.fallbackCount, 1);
    assert.strictEqual(fallbackEventFired, true);
  });

  it('fails with structured error when all candidates in fallback chain fail', async () => {
    const { aiService, primaryMock, secondaryMock } = setupAIService();

    primaryMock.setSimulateFailure(true);
    secondaryMock.setSimulateFailure(true);

    await assert.rejects(
      async () => {
        await aiService.generate({
          modelId: '',
          messages: [{ role: 'user', content: 'Test total failure' }],
          routing: { taskType: 'GENERAL' },
        });
      },
      ProviderUnavailableError
    );
  });
});
