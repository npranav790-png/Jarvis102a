import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createCli } from '../dist/cli/cli.js';

describe('Brain & Memory CLI Commands', () => {
  const originalOffline = process.env.JARVIS_OFFLINE;

  before(() => {
    process.env.JARVIS_OFFLINE = 'true';
  });

  after(() => {
    if (originalOffline === undefined) {
      delete process.env.JARVIS_OFFLINE;
    } else {
      process.env.JARVIS_OFFLINE = originalOffline;
    }
  });
  function captureOutput(fn: () => Promise<void>): Promise<string> {
    return new Promise(async resolve => {
      let output = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        output += args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n';
      };

      try {
        await fn();
      } finally {
        console.log = originalLog;
        resolve(output);
      }
    });
  }

  it('runs `jarvis brain status` and reports limits and memory counts', async () => {
    const cli = createCli();
    const output = await captureOutput(async () => {
      await cli.parseAsync(['node', 'jarvis', 'brain', 'status']);
    });

    assert.ok(output.includes('JARVIS Brain Subsystem'));
    assert.ok(output.includes('Reasoning Modes'));
    assert.ok(output.includes('Max Replans'));
  });

  it('runs `jarvis brain plan` and outputs validated steps and parent task', async () => {
    const cli = createCli();
    const output = await captureOutput(async () => {
      await cli.parseAsync([
        'node',
        'jarvis',
        'brain',
        'plan',
        'Create a simple CLI application',
        '--type',
        'CODING',
      ]);
    });

    assert.ok(output.includes('Plan Created & Validated Successfully'));
    assert.ok(output.includes('Plan ID'));
    assert.ok(output.includes('Parent Task'));
    assert.ok(output.includes('Steps'));
  });

  it('runs `jarvis memory list` and `jarvis memory search`', async () => {
    const cli = createCli();

    const listOutput = await captureOutput(async () => {
      await cli.parseAsync(['node', 'jarvis', 'memory', 'list']);
    });
    assert.ok(listOutput.length > 0);

    const searchOutput = await captureOutput(async () => {
      await cli.parseAsync(['node', 'jarvis', 'memory', 'search', 'architecture']);
    });
    assert.ok(searchOutput.length > 0);
  });
});
