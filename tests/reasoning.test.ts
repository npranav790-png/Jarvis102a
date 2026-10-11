import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { ReasoningRepository } from '../dist/database/repository.js';
import { ReasoningEngine } from '../dist/brain/reasoning.js';

describe('Reasoning Engine & Decision Traceability', () => {
  function setupEngine() {
    const dbConn = new DatabaseConnection(':memory:');
    const db = dbConn.connect();
    initializeSchema(db);

    const reasoningRepo = new ReasoningRepository(db);
    const reasoningEngine = new ReasoningEngine(reasoningRepo);
    return { dbConn, reasoningRepo, reasoningEngine };
  }

  it('FAST reasoning mode yields immediate decision without heavy planning iterations', async () => {
    const { dbConn, reasoningEngine } = setupEngine();

    const res = await reasoningEngine.reason({
      objective: 'What is 15 * 3?',
      mode: 'FAST',
      intent: 'INFORMATION',
    });

    assert.ok(res.decisionSummary.includes('Direct resolution'));
    assert.strictEqual(res.requiresReplanning, false);
    assert.strictEqual(res.recommendedAction, 'EXECUTE_FAST_PATH');

    dbConn.close();
  });

  it('STANDARD and DEEP modes produce concise, auditable decision summaries without chain-of-thought', async () => {
    const { dbConn, reasoningEngine } = setupEngine();

    const res = await reasoningEngine.reason({
      objective: 'Build authentication microservice',
      mode: 'DEEP',
      intent: 'CODING',
      constraints: ['Zero-cost policy enforced', 'Local-only privacy mode'],
    });

    // Verify concise structured summary
    assert.ok(res.decisionSummary.includes('DEEP reasoning mode'));
    assert.ok(res.decisionSummary.includes('constraint(s)'));
    assert.ok(res.rationale.includes('Zero-cost enforcement active'));

    // Assert that raw chain-of-thought markers are NOT emitted
    assert.strictEqual(res.decisionSummary.includes('thinking:'), false);
    assert.strictEqual(res.decisionSummary.includes('<thought>'), false);

    dbConn.close();
  });

  it('detects failure evidence and flags that replanning is required', async () => {
    const { dbConn, reasoningEngine } = setupEngine();

    const res = await reasoningEngine.reason({
      objective: 'Fetch remote documentation',
      mode: 'STANDARD',
      intent: 'RESEARCH',
      evidence: ['Task step 1 executed', 'HTTP 429 rate limit error encountered on provider'],
    });

    assert.strictEqual(res.requiresReplanning, true);
    assert.strictEqual(res.recommendedAction, 'TRIGGER_REPLAN');
    assert.ok(res.decisionSummary.includes('Replanning recommended'));

    dbConn.close();
  });

  it('persists reasoning run to database for auditability', async () => {
    const { dbConn, reasoningRepo, reasoningEngine } = setupEngine();
    const db = dbConn.getDb();
    db.prepare("INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('task_audit_1', 'Audit Task', datetime('now'), datetime('now'))").run();

    const res = await reasoningEngine.reason({
      objective: 'Audit system logs',
      mode: 'STANDARD',
      intent: 'ANALYSIS',
      taskId: 'task_audit_1',
    });

    const stored = reasoningRepo.listByTaskId('task_audit_1');
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].id, res.id);
    assert.strictEqual(stored[0].decision_summary, res.decisionSummary);

    dbConn.close();
  });
});
