import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { ToolRegistry } from '../dist/tools/registry.js';
import type { ITool } from '../dist/tools/types.js';
import { ValidationError, ToolNotFoundError } from '../dist/errors/base.js';

describe('Tool Architecture & Registry', () => {
  const calculatorTool: ITool<{ a: number; b: number }, { sum: number }> = {
    name: 'calculator:add',
    description: 'Adds two numbers safely',
    version: '1.0.0',
    category: 'READ',
    riskLevel: 'LOW',
    permissions: [],
    inputSchema: z.object({
      a: z.number(),
      b: z.number(),
    }),
    outputSchema: z.object({
      sum: z.number(),
    }),
    execute: async (input) => {
      return { sum: input.a + input.b };
    },
  };

  it('registers and executes tool with schema validation', async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);

    assert.strictEqual(registry.has('calculator:add'), true);

    const result = await registry.execute('calculator:add', { a: 15, b: 27 }) as { sum: number };
    assert.strictEqual(result.sum, 42);
  });

  it('fails execution on invalid input parameters', async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);

    await assert.rejects(async () => {
      await registry.execute('calculator:add', { a: 'invalid', b: 27 });
    }, ValidationError);
  });

  it('throws ToolNotFoundError for unknown tools', async () => {
    const registry = new ToolRegistry();
    await assert.rejects(async () => {
      await registry.execute('non_existent_tool', {});
    }, ToolNotFoundError);
  });
});
