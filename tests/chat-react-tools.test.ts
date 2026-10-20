import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { ToolRegistry } from '../dist/tools/registry.js';
import type { ITool } from '../dist/tools/types.js';
import { JarvisEngine } from '../dist/core/engine.js';
import { getConfig } from '../dist/config/config.js';
import { JobQueue } from '../dist/runtime/jobs/queue.js';
import { RuntimeJobRepository } from '../dist/database/runtime-repository.js';

describe('JARVIS 2.0 — Conversational ReAct Tool Execution Loop', () => {
  it('1. ToolRegistry.getDeclarations formats tools into function calling schemas', () => {
    const registry = new ToolRegistry();
    const testTool: ITool<{ query: string; limit?: number }, { results: string[] }> = {
      name: 'search_database',
      description: 'Search internal database records',
      version: '1.0.0',
      category: 'READ',
      riskLevel: 'LOW',
      capabilities: ['db.search'],
      permissions: [],
      supportsCancellation: false,
      inputSchema: z.object({
        query: z.string().describe('Search query keyword'),
        limit: z.number().optional().describe('Maximum records to return'),
      }),
      execute: async (input) => ({ results: [`Result for ${input.query}`] }),
    };

    registry.register(testTool);

    const declarations = registry.getDeclarations();
    assert.strictEqual(declarations.length, 1);
    assert.strictEqual(declarations[0].name, 'search_database');
    assert.strictEqual(declarations[0].description, 'Search internal database records');
    assert.strictEqual(declarations[0].parameters.type, 'object');
    assert.ok(declarations[0].parameters.properties);
    assert.ok((declarations[0].parameters.properties as any).query);
  });

  it('2. JobQueue executes ReAct tool calls and returns final model response', async () => {
    const config = getConfig();
    config.app.env = 'test';
    config.app.offline = true;
    config.database.path = ':memory:';

    const engine = new JarvisEngine(config);
    await engine.initialize();

    // Register a custom test tool
    let toolExecuted = false;
    const calcTool: ITool<{ a: number; b: number }, { sum: number }> = {
      name: 'math.add',
      description: 'Adds two numbers',
      version: '1.0.0',
      category: 'READ',
      riskLevel: 'LOW',
      capabilities: ['math.add'],
      permissions: [],
      supportsCancellation: false,
      inputSchema: z.object({
        a: z.number(),
        b: z.number(),
      }),
      execute: async (input) => {
        toolExecuted = true;
        return { sum: input.a + input.b };
      },
    };
    engine.toolRegistry.register(calcTool);

    // Mock AIService generate to simulate model returning toolCall on 1st turn, then answer on 2nd turn
    let turn = 0;
    engine.aiService.generate = async (req: any) => {
      turn++;
      if (turn === 1) {
        return {
          id: 'gen_1',
          providerId: 'mock',
          modelId: 'mock-model',
          content: 'I need to calculate 25 + 17.',
          finishReason: 'tool_calls',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, estimatedCostUSD: 0 },
          fallbackCount: 0,
          toolCalls: [
            {
              id: 'call_calc_1',
              name: 'math.add',
              arguments: JSON.stringify({ a: 25, b: 17 }),
            },
          ],
        };
      } else {
        // Find tool message in conversation
        const toolMsg = req.messages.find((m: any) => m.role === 'tool');
        assert.ok(toolMsg, 'Must receive tool message in subsequent turn');
        assert.ok(toolMsg.content.includes('42'), 'Tool output must contain sum result 42');

        return {
          id: 'gen_2',
          providerId: 'mock',
          modelId: 'mock-model',
          content: 'The sum of 25 and 17 is 42.',
          finishReason: 'stop',
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30, estimatedCostUSD: 0 },
          fallbackCount: 0,
        };
      }
    };

    const db = engine.db.connect();
    const jobRepo = new RuntimeJobRepository(db);
    const queue = new JobQueue(engine, jobRepo);
    await queue.start();

    try {
      // Track emitted events
      const emittedEvents: string[] = [];
      engine.eventBus.subscribeAll((event) => {
        emittedEvents.push(event.type);
      });

      const session = engine.sessionManager.createSession({ title: 'react-test-session' });

      // Enqueue chat job
      await queue.enqueue({
        type: 'PROCESS_CHAT',
        priority: 1,
        payload: {
          sessionId: session.id,
          message: 'What is 25 + 17?',
        },
        maxAttempts: 1,
        recoveryPolicy: 'IGNORE',
      });

      // Wait for job execution
      await new Promise((resolve) => setTimeout(resolve, 300));

      assert.strictEqual(toolExecuted, true, 'Tool math.add should have executed');
      assert.strictEqual(turn, 2, 'Should have completed 2 turns (tool call -> final response)');
      assert.ok(emittedEvents.includes('chat:tool_executing'), 'Should emit chat:tool_executing event');
      assert.ok(emittedEvents.includes('chat_message'), 'Should emit final chat_message event');

      // Verify stored message in repository
      const messages = engine.messageRepo.listBySession(session.id);
      assert.ok(messages.length > 0);
      const lastMsg = messages[messages.length - 1];
      assert.strictEqual(lastMsg.content, 'The sum of 25 and 17 is 42.');
    } finally {
      await queue.stop();
    }
  });
});

