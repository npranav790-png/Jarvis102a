import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { VerificationRepository, EventRepository } from '../dist/database/repository.js';
import { EventBus } from '../dist/events/bus.js';
import { VerificationEngine } from '../dist/brain/verification.js';
import { ReplanManager } from '../dist/brain/replan.js';
import { ReplanLimitExceededError } from '../dist/errors/base.js';
import type { Plan } from '../dist/brain/types.js';

describe('Verification Engine & Loop Protection (Replanning Limits)', () => {
  function setupVerification() {
    const dbConn = new DatabaseConnection(':memory:');
    const db = dbConn.connect();
    initializeSchema(db);

    const verificationRepo = new VerificationRepository(db);
    const eventRepo = new EventRepository(db);
    const eventBus = new EventBus(eventRepo);
    const verificationEngine = new VerificationEngine(verificationRepo, eventBus);
    const replanManager = new ReplanManager(eventBus, { maxReplans: 2 });

    const now = new Date().toISOString();
    for (const pid of ['plan_1', 'plan_2', 'plan_3']) {
      db.prepare(`INSERT INTO plans (id, objective, created_at, updated_at) VALUES (?, 'Test Plan', ?, ?)`).run(pid, now, now);
    }

    return { dbConn, verificationEngine, replanManager };
  }

  it('evaluates evidence and verifies completion when positive evidence satisfies criteria', async () => {
    const { dbConn, verificationEngine } = setupVerification();

    const result = await verificationEngine.verify({
      planId: 'plan_1',
      objective: 'Run test suite',
      criteria: ['Tests compile', 'Tests pass'],
      evidence: ['Compilation succeeded with 0 errors', 'All 20 tests passed successfully'],
    });

    assert.strictEqual(result.status, 'VERIFIED');
    assert.ok(result.reasoning.includes('All 2 criteria verified'));

    dbConn.close();
  });

  it('marks verification as FAILED when error signals exist in evidence', async () => {
    const { dbConn, verificationEngine } = setupVerification();

    const result = await verificationEngine.verify({
      planId: 'plan_2',
      objective: 'Deploy to environment',
      criteria: ['Build succeeds', 'Deployment completed'],
      evidence: ['Build completed', 'Network error: connection timeout on host port 8080'],
    });

    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.reasoning.includes('Verification failed due to explicit error'));

    dbConn.close();
  });

  it('marks verification as PARTIALLY_VERIFIED when only partial evidence is provided', async () => {
    const { dbConn, verificationEngine } = setupVerification();

    const result = await verificationEngine.verify({
      planId: 'plan_3',
      objective: 'Multi-stage pipeline',
      criteria: ['Stage 1', 'Stage 2', 'Stage 3'],
      evidence: ['Stage 1 completed'],
    });

    assert.strictEqual(result.status, 'PARTIALLY_VERIFIED');

    dbConn.close();
  });

  it('ReplanManager blocks infinite loops and enforces maxReplans limit', async () => {
    const { dbConn, replanManager } = setupVerification();

    const plan: Plan = {
      id: 'plan_loop_test',
      taskId: 'task_parent',
      objective: 'Test infinite loop protection',
      assumptions: [],
      constraints: [],
      successCriteria: [],
      risks: [],
      steps: [],
      status: 'IN_PROGRESS',
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Replan 1 (within limit 2)
    const count1 = await replanManager.recordAndAssertReplan(plan, 'Step 1 failed');
    assert.strictEqual(count1, 1);
    assert.strictEqual(plan.status, 'REPLANNED');

    // Replan 2 (within limit 2)
    const count2 = await replanManager.recordAndAssertReplan(plan, 'Step 2 failed');
    assert.strictEqual(count2, 2);

    // Replan 3 (exceeds limit 2) -> must throw ReplanLimitExceededError
    await assert.rejects(
      async () => {
        await replanManager.recordAndAssertReplan(plan, 'Step 3 failed');
      },
      (err: any) => err instanceof ReplanLimitExceededError && err.code === 'REPLAN_LIMIT_EXCEEDED'
    );

    dbConn.close();
  });
});
