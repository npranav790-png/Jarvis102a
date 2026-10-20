import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JarvisEngine } from '../dist/core/engine.js';
import { getConfig } from '../dist/config/config.js';
import { WorkspaceLockError } from '../dist/errors/base.js';

describe('Prompt 4 End-to-End Integration Suite', () => {
  let engine: JarvisEngine;
  let testWorkspace: string;
  let tempDbPath: string;

  before(async () => {
    tempDbPath = path.join(os.tmpdir(), `jarvis_p4_int_${Date.now()}.db`);
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis_p4_ws_'));

    const config = getConfig();
    config.app.name = 'JARVIS';
    config.app.version = '2.0.0';
    config.app.env = 'test';
    config.app.offline = true;
    config.database.path = tempDbPath;
    config.logging.level = 'ERROR';
    config.logging.format = 'json';
    config.providers.priority = ['mock-provider'];
    config.providers.allowFreeModelsOnly = true;
    config.privacy.mode = 'LOCAL_ONLY';
    config.cost.allowPaidProviders = false;
    config.cost.maxCostPerDay = 0;
    config.security.mode = 'strict';
    config.security.approvalThreshold = 'HIGH';

    engine = new JarvisEngine(config);

    await engine.initialize();
  });

  after(async () => {
    try {
      await engine.shutdown();
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('End-to-End Test 1: Autonomous Agent creates file, verifies output, and updates memory', async () => {
    // 1. Create task
    const task = engine.taskManager.createTask({
      title: 'Initialize project readme',
      description: 'Create a README.md file with initial project documentation',
      type: 'CODING',
      input: {
        toolName: 'filesystem.write',
        toolInput: {
          path: 'README.md',
          content: '# My Autonomous Project\nCreated by JARVIS 2.0 CodingAgent.',
        },
      },
    });

    // 2. Execute via JarvisEngine executeTask
    const result = await engine.executeTask(task.id, {
      rootPath: testWorkspace,
    });

    // 3. Verify success
    assert.strictEqual(result.success, true);
    assert.ok(result.evidence);

    // 4. Verify file exists on disk
    const readmePath = path.join(testWorkspace, 'README.md');
    assert.strictEqual(fs.existsSync(readmePath), true);
    assert.ok(fs.readFileSync(readmePath, 'utf-8').includes('JARVIS 2.0'));

    // 5. Verify task is completed
    const updatedTask = engine.taskManager.getTask(task.id);
    assert.strictEqual(updatedTask.status, 'COMPLETED');

    // 6. Verify episodic memory was created
    const memories = engine.memoryService.listMemories({ type: 'EPISODIC' });
    assert.ok(memories.some(m => m.subject.includes('Initialize project readme')));
  });

  it('End-to-End Test 2: Autonomous Agent reads file content safely within workspace sandbox', async () => {
    const task = engine.taskManager.createTask({
      title: 'Read project documentation',
      type: 'GENERAL',
      input: {
        toolName: 'filesystem.read',
        toolInput: {
          path: 'README.md',
        },
      },
    });

    const result = await engine.executeTask(task.id, {
      rootPath: testWorkspace,
    });

    assert.strictEqual(result.success, true);
    assert.ok((result.output as any).content.includes('My Autonomous Project'));
  });

  it('End-to-End Test 3: Dangerous action without approval is safely blocked', async () => {
    // Attempting a HIGH-risk delete action on a non-approved critical target
    const task = engine.taskManager.createTask({
      title: 'Delete critical database directory',
      type: 'AUTOMATION',
      input: {
        toolName: 'filesystem.delete',
        toolInput: {
          path: 'README.md',
        },
      },
    });

    // No interactive approver set; high-risk action should be blocked and failed
    const result = await engine.executeTask(task.id, {
      rootPath: testWorkspace,
    });

    assert.strictEqual(result.success, false);
    assert.ok(
      result.error?.includes('Action with risk level HIGH was not approved') ||
      result.error?.includes('requires human approval') ||
      result.error?.includes('APPROVAL_REJECTED')
    );

    // File must NOT have been deleted
    assert.strictEqual(fs.existsSync(path.join(testWorkspace, 'README.md')), true);
  });

  it('End-to-End Test 4: Workspace concurrency lock blocks conflicting simultaneous tasks', () => {
    // Task 1 acquires lock
    engine.workspaceManager.acquireLock(testWorkspace, 'task_concurrent_1', 'agent:coding');

    // Task 2 attempts to acquire lock on the same workspace path
    assert.throws(() => {
      engine.workspaceManager.acquireLock(testWorkspace, 'task_concurrent_2', 'agent:general');
    }, WorkspaceLockError);

    // Task 1 releases lock
    engine.workspaceManager.releaseLock(testWorkspace, 'task_concurrent_1');

    // Task 2 can now acquire lock
    assert.doesNotThrow(() => {
      engine.workspaceManager.acquireLock(testWorkspace, 'task_concurrent_2', 'agent:general');
    });

    engine.workspaceManager.releaseLock(testWorkspace, 'task_concurrent_2');
  });
});
