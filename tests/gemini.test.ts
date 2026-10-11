import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GeminiProvider } from '../dist/providers/gemini.js';
import { ProviderRegistry } from '../dist/providers/registry.js';
import { ModelRegistry } from '../dist/providers/model-registry.js';
import { ModelRouter } from '../dist/providers/router.js';
import { ProviderUnavailableError } from '../dist/errors/base.js';
import { redactSecrets } from '../dist/logging/formatter.js';
import { loadConfig } from '../dist/config/config.js';

describe('Google Gemini Cloud Provider & Zero-Cost Architecture', () => {
  // 1. Gemini provider registration
  it('1. registers gemini provider with ID "gemini" and display name "Google Gemini"', () => {
    const registry = new ProviderRegistry(false, 0.0);
    const gemini = new GeminiProvider({ apiKey: 'AIzaSyFakeKeyForUnitTests1234567890' });
    registry.register(gemini);

    assert.strictEqual(gemini.id, 'gemini');
    assert.strictEqual(gemini.name, 'Google Gemini');
    assert.strictEqual(gemini.isPaid, false);
    assert.strictEqual(gemini.isLocal, false);
    assert.strictEqual(registry.has('gemini'), true);
  });

  // 2. ProviderRegistry.get("gemini")
  it('2. retrieves gemini provider via ProviderRegistry.get("gemini")', () => {
    const registry = new ProviderRegistry(false, 0.0);
    const gemini = new GeminiProvider({ apiKey: 'AIzaSyFakeKeyForUnitTests1234567890' });
    registry.register(gemini);

    const retrieved = registry.get('gemini');
    assert.strictEqual(retrieved.id, 'gemini');
    assert.strictEqual(retrieved.name, 'Google Gemini');
  });

  // 3. Missing GEMINI_API_KEY
  it('3. reports MISCONFIGURED when GEMINI_API_KEY is missing or empty', async () => {
    const gemini = new GeminiProvider({ apiKey: '' });
    const health = await gemini.healthCheck();

    assert.strictEqual(health.status, 'MISCONFIGURED');
    assert.ok(health.message?.includes('GEMINI_API_KEY is not configured'));

    await assert.rejects(
      async () => {
        await gemini.generate({
          modelId: 'gemini-3.7-flash',
          messages: [{ role: 'user', content: 'hello' }],
        });
      },
      (err: any) => {
        assert.ok(err instanceof ProviderUnavailableError);
        assert.ok(err.message.includes('GEMINI_API_KEY is not configured'));
        return true;
      }
    );
  });

  // 4. Valid configuration
  it('4. sets and reads valid configuration and default model', () => {
    const gemini = new GeminiProvider({
      apiKey: 'AIzaSyTestKeyValidConfig987654321012345',
      defaultModel: 'gemini-3.7-flash',
    });

    assert.strictEqual(gemini.getApiKey(), 'AIzaSyTestKeyValidConfig987654321012345');
    assert.strictEqual(gemini.getDefaultModel(), 'gemini-3.7-flash');

    gemini.setDefaultModel('gemini-3.5-flash');
    assert.strictEqual(gemini.getDefaultModel(), 'gemini-3.5-flash');
  });

  // 5. Invalid API key handling
  it('5. maps HTTP 400/403 invalid key error into MISCONFIGURED health status', async () => {
    const gemini = new GeminiProvider({
      apiKey: 'AIzaSyInvalidFakeKeyDefinitelyNotReal999',
      initialDelayMs: 5,
    });

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: false,
        status: 400,
        text: async () => 'API_KEY_INVALID',
      }) as any;

      const health = await gemini.healthCheck();
      assert.strictEqual(health.status, 'MISCONFIGURED');
      assert.ok(health.message?.includes('Invalid or unauthorized Gemini API key'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 6. Gemini API request & 7. Gemini response parsing
  it('6 & 7. formats Gemini payload correctly and parses candidate parts with token usage', async () => {
    const mockGemini = new GeminiProvider({ apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123' });

    // Mock fetch for deterministic testing of response parsing
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        assert.ok(body.contents);
        assert.strictEqual(body.contents[0].parts[0].text, 'Hello JARVIS');
        assert.ok(body.system_instruction);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Greetings, sir. All neural cloud systems operational.' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 12,
              candidatesTokenCount: 10,
              totalTokenCount: 22,
            },
          }),
        } as any;
      };

      const response = await mockGemini.generate({
        modelId: 'gemini-3.7-flash',
        messages: [{ role: 'user', content: 'Hello JARVIS' }],
      });

      assert.strictEqual(response.content, 'Greetings, sir. All neural cloud systems operational.');
      assert.strictEqual(response.finishReason, 'stop');
      assert.strictEqual(response.usage.promptTokens, 12);
      assert.strictEqual(response.usage.completionTokens, 10);
      assert.strictEqual(response.usage.totalTokens, 22);
      assert.strictEqual(response.usage.estimatedCostUSD, 0.0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 8. Streaming support
  it('8. streams response chunks from SSE stream', async () => {
    const mockGemini = new GeminiProvider({ apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123' });

    const originalFetch = globalThis.fetch;
    try {
      const sseData = 
        'data: {"candidates":[{"content":{"parts":[{"text":"Streamed "}]}}]}\n\n' +
        'data: {"candidates":[{"content":{"parts":[{"text":"Gemini chunk"}]}}]}\n\n';

      globalThis.fetch = async () => {
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => {
              let sent = false;
              return {
                read: async () => {
                  if (!sent) {
                    sent = true;
                    return { done: false, value: new TextEncoder().encode(sseData) };
                  }
                  return { done: true, value: undefined };
                },
              };
            },
          },
        } as any;
      };

      const chunks: string[] = [];
      for await (const chunk of mockGemini.stream({
        modelId: 'gemini-3.7-flash',
        messages: [{ role: 'user', content: 'Stream test' }],
      })) {
        if (chunk.delta) chunks.push(chunk.delta);
      }

      assert.deepStrictEqual(chunks, ['Streamed ', 'Gemini chunk']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 9. Rate-limit handling
  it('9. handles HTTP 429 rate limit and maps to RATE_LIMITED status', async () => {
    const mockGemini = new GeminiProvider({
      apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123',
      initialDelayMs: 5,
    });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
        text: async () => 'RESOURCE_EXHAUSTED',
      }) as any;

      const health = await mockGemini.healthCheck();
      assert.strictEqual(health.status, 'RATE_LIMITED');
      assert.ok(health.message?.includes('rate limit reached'));

      await assert.rejects(
        async () => {
          await mockGemini.generate({
            modelId: 'gemini-3.7-flash',
            messages: [{ role: 'user', content: 'test' }],
          });
        },
        (err: any) => {
          assert.ok(err instanceof ProviderUnavailableError);
          assert.ok(err.message.includes('rate limit'));
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 10. Free-tier cost guard
  it('10. guarantees zero-cost ($0.00) for all Gemini models', async () => {
    const gemini = new GeminiProvider({ apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123' });
    const models = await gemini.listModels();

    assert.ok(models.length >= 3);
    for (const m of models) {
      assert.strictEqual(m.isFree, true);
      assert.strictEqual(m.costPer1kInputTokens, 0.0);
      assert.strictEqual(m.costPer1kOutputTokens, 0.0);
      assert.strictEqual(m.isLocal, false);
      assert.strictEqual(m.privacyClass, 'PUBLIC_CLOUD');
      assert.ok(m.id.startsWith('gemini-'));
    }
  });

  // 11. Cloud-only routing & 12. No Ollama fallback
  it('11 & 12. routes to cloud Gemini under CLOUD_ONLY and strictly excludes Ollama/local models', async () => {
    const providerRegistry = new ProviderRegistry(false, 0.0);
    const gemini = new GeminiProvider({ apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123' });
    gemini.healthCheck = async () => ({ status: 'ONLINE', latencyMs: 35, lastChecked: new Date().toISOString() });
    providerRegistry.register(gemini);

    const modelRegistry = new ModelRegistry(providerRegistry, false);
    await modelRegistry.refresh();

    const router = new ModelRouter(modelRegistry, providerRegistry, {
      defaultPrivacyMode: 'CLOUD_ONLY',
      providerPriority: ['gemini', 'groq'],
    });

    const decision = await router.route({
      taskType: 'GENERAL',
      privacyMode: 'CLOUD_ONLY',
    });

    assert.strictEqual(decision.selectedProviderId, 'gemini');
    assert.ok(decision.selectedModelId.includes('gemini'));
    assert.strictEqual(decision.costStatus, 'FREE_VERIFIED');

    // Verify all candidates are strictly cloud models
    for (const fallback of decision.fallbackChain) {
      assert.notStrictEqual(fallback.providerId, 'ollama');
    }
  });

  // 13. API key secret sanitization
  it('13. redacts Google Gemini API keys (AIza...) from logs and serialized output', () => {
    const rawLog = 'Connecting to Gemini with key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6';
    const redacted = redactSecrets(rawLog) as string;

    assert.strictEqual(redacted.includes('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6'), false);
    assert.ok(redacted.includes('***REDACTED***'));

    const objWithSecret = {
      geminiApiKey: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6',
      normalField: 'JARVIS 2.0',
    };
    const cleaned = redactSecrets(objWithSecret) as any;
    assert.strictEqual(cleaned.geminiApiKey, '***REDACTED***');
    assert.strictEqual(cleaned.normalField, 'JARVIS 2.0');
  });

  // 14. Settings TEST endpoint & 15. Provider health state
  it('14 & 15. checks provider health and provides real health status across registry', async () => {
    const registry = new ProviderRegistry(false, 0.0);
    const gemini = new GeminiProvider({ apiKey: '' });
    registry.register(gemini);

    const health = await registry.checkHealth('gemini');
    assert.strictEqual(health.status, 'MISCONFIGURED');

    const allHealth = await registry.checkAllHealth();
    assert.ok(allHealth['gemini']);
    assert.strictEqual(allHealth['gemini'].status, 'MISCONFIGURED');
  });

  // 16. Transient Error: 503 -> retry -> success
  it('16. handles HTTP 503 transient error by retrying with backoff and succeeding', async () => {
    const gemini = new GeminiProvider({
      apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123',
      initialDelayMs: 5,
      maxRetries: 3,
    });

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 503,
            text: async () => 'Service Unavailable',
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: { parts: [{ text: 'Recovered after 503' }], role: 'model' },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
          }),
        } as any;
      };

      const res = await gemini.generate({
        modelId: 'gemini-3.7-flash',
        messages: [{ role: 'user', content: 'test 503 retry' }],
      });

      assert.strictEqual(callCount, 2);
      assert.strictEqual(res.content, 'Recovered after 503');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 17. Transient Error: 503 -> 503 -> 503 -> final failure with TEMPORARILY_UNAVAILABLE
  it('17. exhausts bounded retries on persistent HTTP 503 and exposes TEMPORARILY_UNAVAILABLE', async () => {
    const gemini = new GeminiProvider({
      apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123',
      initialDelayMs: 5,
      maxRetries: 3,
    });

    let generateCallCount = 0;
    let healthCallCount = 0;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: any) => {
        if (String(url).includes('generateContent')) {
          generateCallCount++;
        } else {
          healthCallCount++;
        }
        return {
          ok: false,
          status: 503,
          text: async () => 'Google Gemini service is temporarily unavailable',
        } as any;
      };

      // Test generate() failure
      await assert.rejects(
        async () => {
          await gemini.generate({
            modelId: 'gemini-3.7-flash',
            messages: [{ role: 'user', content: 'persistent 503' }],
          });
        },
        (err: any) => {
          assert.ok(err instanceof ProviderUnavailableError);
          assert.ok(err.message.includes('503'));
          return true;
        }
      );
      // Initial attempt + 3 retries = 4 calls
      assert.strictEqual(generateCallCount, 4);

      // Test healthCheck() truthful TEMPORARILY_UNAVAILABLE status
      const health = await gemini.healthCheck();
      assert.strictEqual(health.status, 'TEMPORARILY_UNAVAILABLE');
      assert.strictEqual(healthCallCount, 4);
      assert.ok(health.message?.includes('temporarily unavailable'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 18. Non-retryable: 401 -> no retry
  it('18. does NOT retry HTTP 401 unauthorized errors (fails immediately)', async () => {
    const gemini = new GeminiProvider({
      apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123',
      initialDelayMs: 5,
      maxRetries: 3,
    });

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        callCount++;
        return {
          ok: false,
          status: 401,
          text: async () => 'API_KEY_INVALID',
        } as any;
      };

      await assert.rejects(
        async () => {
          await gemini.generate({
            modelId: 'gemini-3.7-flash',
            messages: [{ role: 'user', content: 'test 401' }],
          });
        },
        (err: any) => {
          assert.ok(err instanceof ProviderUnavailableError);
          assert.ok(err.message.includes('401'));
          return true;
        }
      );

      // Must NOT retry - exactly 1 call
      assert.strictEqual(callCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 19. Non-retryable: 403 -> no retry
  it('19. does NOT retry HTTP 403 forbidden errors (fails immediately)', async () => {
    const gemini = new GeminiProvider({
      apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123',
      initialDelayMs: 5,
      maxRetries: 3,
    });

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        callCount++;
        return {
          ok: false,
          status: 403,
          text: async () => 'PERMISSION_DENIED',
        } as any;
      };

      await assert.rejects(
        async () => {
          await gemini.generate({
            modelId: 'gemini-3.7-flash',
            messages: [{ role: 'user', content: 'test 403' }],
          });
        },
        (err: any) => {
          assert.ok(err instanceof ProviderUnavailableError);
          assert.ok(err.message.includes('403'));
          return true;
        }
      );

      // Must NOT retry - exactly 1 call
      assert.strictEqual(callCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 20. Retryable: 429 -> retry -> success
  it('20. retries HTTP 429 rate limit errors with backoff', async () => {
    const gemini = new GeminiProvider({
      apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123',
      initialDelayMs: 5,
      maxRetries: 3,
    });

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        callCount++;
        if (callCount <= 2) {
          return {
            ok: false,
            status: 429,
            text: async () => 'RESOURCE_EXHAUSTED',
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: { parts: [{ text: 'Recovered after rate limit' }], role: 'model' },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
          }),
        } as any;
      };

      const res = await gemini.generate({
        modelId: 'gemini-3.7-flash',
        messages: [{ role: 'user', content: 'test 429 retry' }],
      });

      assert.strictEqual(callCount, 3);
      assert.strictEqual(res.content, 'Recovered after rate limit');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 21. Non-retryable: invalid model (404) -> no retry
  it('21. does NOT retry invalid model HTTP 404 (fails immediately)', async () => {
    const gemini = new GeminiProvider({
      apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123',
      initialDelayMs: 5,
      maxRetries: 3,
    });

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        callCount++;
        return {
          ok: false,
          status: 404,
          text: async () => 'models/non-existent-model is not found',
        } as any;
      };

      await assert.rejects(
        async () => {
          await gemini.generate({
            modelId: 'non-existent-model',
            messages: [{ role: 'user', content: 'test invalid model' }],
          });
        },
        (err: any) => {
          assert.ok(err instanceof ProviderUnavailableError);
          assert.ok(err.message.includes('404'));
          return true;
        }
      );

      // Must NOT retry - exactly 1 call
      assert.strictEqual(callCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 22. API key never appears in logs or error messages
  it('22. guarantees API key is never exposed in error messages or logs', async () => {
    const secretKey = 'AIzaSySecretApiKeyThatMustNeverBeLogged12345';
    const gemini = new GeminiProvider({
      apiKey: secretKey,
      initialDelayMs: 5,
      maxRetries: 1,
    });

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return {
          ok: false,
          status: 503,
          text: async () => `Error on request to https://generativelanguage.googleapis.com/v1beta/models?key=${secretKey}`,
        } as any;
      };

      try {
        await gemini.generate({
          modelId: 'gemini-3.7-flash',
          messages: [{ role: 'user', content: 'test secret safety' }],
        });
        assert.fail('Should have thrown error');
      } catch (err: any) {
        const sanitized = redactSecrets(err.message) as string;
        assert.strictEqual(sanitized.includes(secretKey), false);
        assert.strictEqual(err.message.includes(secretKey), false);
      }

      const health = await gemini.healthCheck();
      const sanitizedHealth = redactSecrets(health.message || '') as string;
      assert.strictEqual(sanitizedHealth.includes(secretKey), false);
      assert.strictEqual((health.message || '').includes(secretKey), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 23. Multimodal vision & document input support
  it('23. formats multimodal attachments with inline_data in Gemini contents payload', async () => {
    const gemini = new GeminiProvider({ apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123' });
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: { parts: [{ text: 'Image analyzed successfully.' }], role: 'model' },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, totalTokenCount: 60 },
          }),
        } as any;
      };

      const res = await gemini.generate({
        modelId: 'gemini-3.7-flash',
        messages: [
          {
            role: 'user',
            content: 'Describe this image',
            attachments: [
              {
                mimeType: 'image/png',
                data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              },
            ],
          },
        ],
      });

      assert.strictEqual(res.content, 'Image analyzed successfully.');
      assert.ok(capturedBody);
      const userParts = capturedBody.contents[0].parts;
      assert.strictEqual(userParts[0].text, 'Describe this image');
      assert.strictEqual(userParts[1].inline_data.mime_type, 'image/png');
      assert.ok(userParts[1].inline_data.data.startsWith('iVBORw0KGgo'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 24. Streaming tool declarations
  it('24. includes function_declarations in stream request payload when tools are provided', async () => {
    const gemini = new GeminiProvider({ apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123' });
    let capturedStreamBody: any = null;

    const originalFetch = globalThis.fetch;
    try {
      const sseData = 'data: {"candidates":[{"content":{"parts":[{"text":"Calling tool"}]}}]}\n\n';

      globalThis.fetch = async (url: any, init: any) => {
        capturedStreamBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => {
              let sent = false;
              return {
                read: async () => {
                  if (!sent) {
                    sent = true;
                    return { done: false, value: new TextEncoder().encode(sseData) };
                  }
                  return { done: true, value: undefined };
                },
              };
            },
          },
        } as any;
      };

      const chunks: string[] = [];
      for await (const chunk of gemini.stream({
        modelId: 'gemini-3.7-flash',
        messages: [{ role: 'user', content: 'Run tool' }],
        tools: [
          {
            name: 'getWeather',
            description: 'Get current weather',
            parameters: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
      })) {
        if (chunk.delta) chunks.push(chunk.delta);
      }

      assert.deepStrictEqual(chunks, ['Calling tool']);
      assert.ok(capturedStreamBody.tools);
      assert.strictEqual(capturedStreamBody.tools[0].function_declarations[0].name, 'getWeather');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 25. Hybrid reasoning thinkingConfig
  it('25. passes thinking_config to generationConfig when thinkingBudget is specified', async () => {
    const gemini = new GeminiProvider({ apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123' });
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: { parts: [{ text: 'Deep thinking output.' }], role: 'model' },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
          }),
        } as any;
      };

      const res = await gemini.generate({
        modelId: 'gemini-3.7-flash',
        messages: [{ role: 'user', content: 'Solve complex problem' }],
        thinkingBudget: 2048,
      });

      assert.strictEqual(res.content, 'Deep thinking output.');
      assert.strictEqual(capturedBody.generationConfig.thinking_config.thinking_budget, 2048);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 26. Zero-cost vector embeddings with text-embedding-004
  it('26. generates vector embeddings via text-embedding-004 endpoint and batchEmbedContents', async () => {
    const gemini = new GeminiProvider({ apiKey: 'AIzaSyMockKeyForUnitTestingPurposes123' });
    let capturedUrl = '';
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init.body);
        if (capturedUrl.includes('batchEmbedContents')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              embeddings: [
                { values: [0.1, 0.2, 0.3, 0.4] },
                { values: [0.5, 0.6, 0.7, 0.8] },
              ],
            }),
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            embedding: { values: [0.123, -0.456, 0.789] },
          }),
        } as any;
      };

      const singleVec = await gemini.embed('Semantic memory entry');
      assert.deepStrictEqual(singleVec, [0.123, -0.456, 0.789]);
      assert.ok(capturedUrl.includes('text-embedding-004:embedContent'));
      assert.strictEqual(capturedBody.content.parts[0].text, 'Semantic memory entry');

      const batchVecs = await gemini.embedBatch(['First memory', 'Second memory']);
      assert.strictEqual(batchVecs.length, 2);
      assert.deepStrictEqual(batchVecs[0], [0.1, 0.2, 0.3, 0.4]);
      assert.deepStrictEqual(batchVecs[1], [0.5, 0.6, 0.7, 0.8]);
      assert.ok(capturedUrl.includes('text-embedding-004:batchEmbedContents'));
      assert.strictEqual(capturedBody.requests.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 27. Client-side RPM rate limiting
  it('27. enforces client-side rate limiting (maxRequestsPerMinute) and exposes stats', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      } as any);

      const gemini = new GeminiProvider({
        apiKey: 'AIzaMockKeyForTestingLimiting',
        maxRequestsPerMinute: 2,
      });

      // 1st request succeeds
      await gemini.generate({ modelId: 'gemini-3.7-flash', messages: [{ role: 'user', content: 'test 1' }] });
      // 2nd request succeeds
      await gemini.generate({ modelId: 'gemini-3.7-flash', messages: [{ role: 'user', content: 'test 2' }] });

      const stats = gemini.getRateLimitStats();
      assert.strictEqual(stats.requestsLastMinute, 2);
      assert.strictEqual(stats.maxRpm, 2);

      // 3rd request should exceed limit and throw ProviderUnavailableError
      await assert.rejects(
        async () => {
          await gemini.generate({ modelId: 'gemini-3.7-flash', messages: [{ role: 'user', content: 'test 3' }] });
        },
        (err: any) => {
          assert.ok(err.message.toLowerCase().includes('rate limit'));
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

