import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JarvisEngine } from '../dist/core/engine.js';
import { loadConfig } from '../dist/config/config.js';

describe('Jarvis Core Engine Lifecycle & Integration', () => {
  it('boots, runs diagnostics, creates entities, and shuts down cleanly', async () => {
    const config = loadConfig(undefined, {
      database: { path: ':memory:' },
      cost: { allowPaidProviders: false, maxCostPerDay: 0.0 },
    });

    const engine = new JarvisEngine(config);
    await engine.initialize();
    assert.strictEqual(engine.isInitialized(), true);

    // Diagnostics / Status check
    const status = await engine.status();
    assert.strictEqual(status.database.status, 'CONNECTED');
    assert.ok(status.providers.count >= 1);
    assert.strictEqual(status.costPolicy.allowPaidProviders, false);

    // Subsystem interaction through engine
    const project = engine.projectManager.createProject({
      name: 'Engine Test Project',
      rootPath: './',
    });

    const session = engine.sessionManager.createSession({
      title: 'Engine Test Session',
      projectId: project.id,
    });

    const task = engine.taskManager.createTask({
      title: 'Engine Test Task',
      projectId: project.id,
      sessionId: session.id,
    });

    engine.taskManager.queueTask(task.id);
    engine.taskManager.startTask(task.id);
    engine.taskManager.completeTask(task.id, { success: true });

    const finalStatus = await engine.status();
    assert.strictEqual(finalStatus.counts.projects, 1);
    assert.strictEqual(finalStatus.counts.sessions, 1);
    assert.strictEqual(finalStatus.counts.tasks, 1);
    assert.ok(finalStatus.counts.events > 0);

    await engine.shutdown();
    assert.strictEqual(engine.isInitialized(), false);
  });
});
