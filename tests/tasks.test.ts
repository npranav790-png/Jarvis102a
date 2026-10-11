import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { TaskRepository } from '../dist/database/repository.js';
import { TaskManager } from '../dist/tasks/manager.js';
import { InvalidTaskStateTransitionError, TaskNotFoundError } from '../dist/errors/base.js';

describe('Task System & Lifecycle State Machine', () => {
  let conn: DatabaseConnection;
  let manager: TaskManager;

  beforeEach(() => {
    conn = new DatabaseConnection(':memory:');
    const db = conn.connect();
    initializeSchema(db);
    const repo = new TaskRepository(db);
    manager = new TaskManager(repo);
  });

  afterEach(() => {
    conn.close();
  });

  it('progresses task through standard happy path: CREATED -> QUEUED -> RUNNING -> COMPLETED', () => {
    const task = manager.createTask({
      title: 'Analyze codebase',
      priority: 8,
      type: 'RESEARCH',
    });

    assert.strictEqual(task.status, 'CREATED');
    assert.strictEqual(task.priority, 8);

    const queued = manager.queueTask(task.id);
    assert.strictEqual(queued.status, 'QUEUED');

    const running = manager.startTask(task.id);
    assert.strictEqual(running.status, 'RUNNING');
    assert.ok(running.startedAt !== null);

    const completed = manager.completeTask(task.id, { filesFound: 42 });
    assert.strictEqual(completed.status, 'COMPLETED');
    assert.ok(completed.completedAt !== null);
    assert.deepStrictEqual(completed.output, { filesFound: 42 });
  });

  it('rejects invalid state transitions', () => {
    const task = manager.createTask({ title: 'Direct complete attempt' });
    // Attempting to directly complete from CREATED (illegal transition)
    assert.throws(() => {
      manager.completeTask(task.id);
    }, InvalidTaskStateTransitionError);
  });

  it('handles retries when tasks fail', () => {
    const task = manager.createTask({
      title: 'Flaky network job',
      maxRetries: 2,
    });

    manager.queueTask(task.id);
    manager.startTask(task.id);

    // First failure: should re-queue for retry
    const retried1 = manager.failTask(task.id, { code: 'NETWORK_TIMEOUT', message: 'Failed to connect' }, true);
    assert.strictEqual(retried1.status, 'QUEUED');
    assert.strictEqual(retried1.retryCount, 1);

    // Second failure: should re-queue for retry
    manager.startTask(task.id);
    const retried2 = manager.failTask(task.id, { code: 'NETWORK_TIMEOUT', message: 'Failed to connect again' }, true);
    assert.strictEqual(retried2.status, 'QUEUED');
    assert.strictEqual(retried2.retryCount, 2);

    // Third failure: exceeded maxRetries (2) -> terminal FAILED state
    manager.startTask(task.id);
    const failed = manager.failTask(task.id, { code: 'NETWORK_TIMEOUT', message: 'Final failure' }, true);
    assert.strictEqual(failed.status, 'FAILED');
    assert.ok(failed.completedAt !== null);
  });

  it('supports task cancellation', () => {
    const task = manager.createTask({ title: 'Long task' });
    manager.queueTask(task.id);

    const cancelled = manager.cancelTask(task.id, 'User stopped it');
    assert.strictEqual(cancelled.status, 'CANCELLED');
  });

  it('supports parent-child task hierarchy', () => {
    const parent = manager.createTask({ title: 'Parent Workflow' });
    const child = manager.createTask({
      title: 'Child Subtask',
      parentTaskId: parent.id,
    });

    assert.strictEqual(child.parentTaskId, parent.id);
  });
});
