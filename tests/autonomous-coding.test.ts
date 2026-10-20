import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { codeDiagnoseTool } from '../dist/tools/builtin/code-diagnose.js';
import { CodingAgent } from '../dist/agents/specialized/coding.js';
import { ToolRegistry } from '../dist/tools/registry.js';
import { ALL_BUILTIN_TOOLS } from '../dist/tools/builtin/index.js';

describe('Phase 3: Autonomous Coding & Self-Healing Loop', () => {
  it('executes code.diagnose tool and validates clean diagnostics', async () => {
    const res = await codeDiagnoseTool.execute({ runner: 'auto', timeoutMs: 30000 });

    assert.strictEqual(typeof res.clean, 'boolean');
    assert.strictEqual(typeof res.errorCount, 'number');
    assert.strictEqual(typeof res.warningCount, 'number');
    assert.ok(Array.isArray(res.diagnostics));
    assert.ok(res.summary);
  });

  it('runs CodingAgent with file generation, self-healing diagnostics, and notifications', async () => {
    const testDir = path.join(os.tmpdir(), `jarvis_coding_test_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    const targetFile = path.join(testDir, 'sample.ts');

    const toolRegistry = new ToolRegistry();
    for (const tool of ALL_BUILTIN_TOOLS) {
      toolRegistry.register(tool);
    }

    const agent = new CodingAgent({ toolRegistry });


    const task = {
      id: 'task_code_heal_1',
      title: 'Generate Math Utility',
      description: 'Create a clean math helper module with type annotations',
      type: 'CODING' as any,
      status: 'CREATED' as any,
      priority: 5,
      input: {
        filePath: targetFile,
        fileContent: 'export function add(a: number, b: number): number { return a + b; }',
        autoHeal: true,
        notify: true,
      },
      output: null,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const executionContext = {
      actor: 'test-runner',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      rootPath: testDir,
    };

    const result = await agent.run(task, executionContext as any);

    assert.strictEqual(result.success, true);
    assert.ok(fs.existsSync(targetFile));
    assert.ok(fs.readFileSync(targetFile, 'utf-8').includes('function add'));

    // Verify tool execution steps: write, diagnose, notify
    assert.ok(result.steps.length >= 2);
    const toolNames = result.steps.map(s => s.toolName);
    assert.ok(toolNames.includes('filesystem.write'));
    assert.ok(toolNames.includes('code.diagnose'));
    assert.ok(toolNames.includes('system_notification'));

    // Cleanup
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });
});
