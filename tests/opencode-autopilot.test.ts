import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OpenCodeOrchestrator } from '../dist/orchestration/opencode/orchestrator.js';
import { EventBus } from '../dist/events/bus.js';

describe('JARVIS 2.0 — OpenCode Multi-Phase Autopilot & Self-Healing', () => {
  function createTestOrchestrator() {
    const eventBus = new EventBus();
    const orchestrator = new OpenCodeOrchestrator(undefined, undefined, eventBus);
    return { orchestrator, eventBus };
  }

  it('1. executePhase executes sequential phases, tracks progress, and marks completion', async () => {
    const { orchestrator } = createTestOrchestrator();

    const job = await orchestrator.submitOrder({
      orderText: 'Build real-time vector search subsystem',
      targetWorkspace: process.cwd(),
      skipPlanApproval: false,
    });

    // Populate a mock multi-phase project plan
    job.projectPlan = {
      title: 'Vector Search Implementation',
      summary: '3-phase rollout for embedding and memory indexing',
      architecturalReview: 'Modular embedding service with unit tests',
      technicalDecisions: ['Cosine similarity', 'Bag-of-words fallback'],
      phases: [
        {
          phaseNumber: 1,
          title: 'Embedding Service Foundation',
          description: 'Define EmbeddingService interface and Google/Ollama providers',
          tasks: ['Create embeddings.ts', 'Add cosine math'],
          deliverables: ['embeddings.ts'],
        },
        {
          phaseNumber: 2,
          title: 'Memory Repository Integration',
          description: 'Persist vector arrays in metadata_json',
          tasks: ['Modify memory-service.ts'],
          deliverables: ['memory-service.ts'],
        },
      ],
      risksAndMitigations: [],
      validationCriteria: ['All tests pass'],
    };

    // Execute Phase 1
    const p1 = await orchestrator.executePhase(job.id, 1);
    assert.strictEqual(p1.currentPhase, 1);
    assert.deepStrictEqual(p1.completedPhases, [1]);
    assert.strictEqual(p1.status, 'DEVELOPING');
    assert.strictEqual(p1.rollbackStatus, 'AVAILABLE');
    assert.strictEqual(p1.phaseResults?.[1].status, 'SUCCESS');

    // Execute Phase 2 (all phases now complete)
    const p2 = await orchestrator.executePhase(job.id, 2);
    assert.strictEqual(p2.currentPhase, 2);
    assert.deepStrictEqual(p2.completedPhases, [1, 2]);
    assert.strictEqual(p2.status, 'COMPLETED');
    assert.strictEqual(p2.phaseResults?.[2].status, 'SUCCESS');
  });

  it('2. selfHeal analyzes test failures, formulates patches, and resolves issues', async () => {
    const { orchestrator } = createTestOrchestrator();

    const job = await orchestrator.submitOrder({
      orderText: 'Refactor database migration schema',
      targetWorkspace: process.cwd(),
    });

    job.status = 'VERIFYING';

    const healResult = await orchestrator.selfHeal(
      job.id,
      'AssertionError: Expected table "vectors" to exist but got undefined at line 42'
    );

    assert.strictEqual(healResult.success, true);
    assert.strictEqual(healResult.attempts, 1);
    assert.ok(healResult.fixedDiff);

    const updatedJob = orchestrator.getJob(job.id);
    assert.strictEqual(updatedJob?.selfHealAttempts, 1);
    assert.strictEqual(updatedJob?.status, 'COMPLETED');
  });

  it('3. rollbackJob reverts workspace changes to prior phase or initial checkpoint', async () => {
    const { orchestrator } = createTestOrchestrator();

    const job = await orchestrator.submitOrder({
      orderText: 'Experimental UI rewrite',
      targetWorkspace: process.cwd(),
    });

    job.completedPhases = [1, 2];
    job.currentPhase = 2;
    job.rollbackStatus = 'AVAILABLE';

    // 1-Click Rollback to Phase 1
    const rollbackPhase1 = await orchestrator.rollbackJob(job.id, 2);
    assert.strictEqual(rollbackPhase1.success, true);
    assert.strictEqual(rollbackPhase1.rolledBackTo, 'Phase 2');

    const jobAfterPhase1Rollback = orchestrator.getJob(job.id);
    assert.deepStrictEqual(jobAfterPhase1Rollback?.completedPhases, [1]);
    assert.strictEqual(jobAfterPhase1Rollback?.rollbackStatus, 'ROLLED_BACK');

    // Full 1-Click Rollback to Initial Checkpoint
    const fullRollback = await orchestrator.rollbackJob(job.id);
    assert.strictEqual(fullRollback.success, true);
    assert.strictEqual(fullRollback.rolledBackTo, 'Initial Pre-Execution Checkpoint');

    const jobAfterFullRollback = orchestrator.getJob(job.id);
    assert.deepStrictEqual(jobAfterFullRollback?.completedPhases, []);
    assert.strictEqual(jobAfterFullRollback?.currentPhase, undefined);
  });
});
