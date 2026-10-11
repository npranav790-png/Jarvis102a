import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { ApprovalRepository } from '../dist/database/repository.js';
import { SecurityPolicy } from '../dist/security/policy.js';
import { ApprovalManager } from '../dist/security/approval-manager.js';
import { ApprovalRejectedError, ApprovalExpiredError } from '../dist/errors/base.js';

describe('ApprovalManager & Policy Engine', () => {
  let dbConn: DatabaseConnection;
  let approvalRepo: ApprovalRepository;
  let policy: SecurityPolicy;
  let tempDbPath: string;

  before(() => {
    tempDbPath = path.join(os.tmpdir(), `jarvis_appr_test_${Date.now()}.db`);
    dbConn = new DatabaseConnection(tempDbPath);
    const db = dbConn.connect();
    initializeSchema(db);
    approvalRepo = new ApprovalRepository(db);
    policy = new SecurityPolicy('strict', 'HIGH');
  });

  after(() => {
    try {
      dbConn.close();
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch {
      // Ignore
    }
  });

  it('auto-approves low-risk actions without human confirmation', async () => {
    const manager = new ApprovalManager(policy, approvalRepo);
    const approved = await manager.evaluateAndRequestApproval({
      action: 'filesystem.read',
      category: 'READ',
      riskLevel: 'LOW',
      actor: 'agent:general',
      target: 'config.json',
    });

    assert.strictEqual(approved, true);
  });

  it('blocks high-risk actions when no interactive approver is registered', async () => {
    const manager = new ApprovalManager(policy, approvalRepo);

    await assert.rejects(async () => {
      await manager.evaluateAndRequestApproval({
        action: 'filesystem.delete',
        category: 'DESTRUCTIVE',
        riskLevel: 'HIGH',
        actor: 'agent:general',
        target: 'critical_dir',
      });
    }, ApprovalRejectedError);
  });

  it('allows high-risk actions when interactive approver approves', async () => {
    const manager = new ApprovalManager(policy, approvalRepo);
    manager.setApprover(async (req) => {
      assert.strictEqual(req.action, 'filesystem.delete');
      return true;
    });

    const approved = await manager.evaluateAndRequestApproval({
      action: 'filesystem.delete',
      category: 'DESTRUCTIVE',
      riskLevel: 'HIGH',
      actor: 'agent:general',
      target: 'temp_dir',
    });

    assert.strictEqual(approved, true);
  });

  it('supports scoped task approvals without repeated prompts', async () => {
    const manager = new ApprovalManager(policy, approvalRepo);
    // No approver registered
    const taskId = 'task_scope_1';

    // Grant scoped approval for task
    manager.grantScopeApproval(taskId, 'WRITE', 60);

    // High risk WRITE action for the task should be auto-approved by active scope
    const approved = await manager.evaluateAndRequestApproval({
      action: 'filesystem.write',
      category: 'WRITE',
      riskLevel: 'HIGH',
      actor: 'agent:coding',
      target: 'src/main.ts',
      taskId,
    });

    assert.strictEqual(approved, true);
  });

  it('can list, approve, and deny pending requests', async () => {
    const manager = new ApprovalManager(policy, approvalRepo);
    let capturedId = '';

    manager.setApprover(async (req) => {
      capturedId = req.id;
      return false; // Leave pending / deny initially
    });

    try {
      await manager.evaluateAndRequestApproval({
        action: 'shell.execute',
        category: 'EXECUTE',
        riskLevel: 'HIGH',
        actor: 'test',
        target: 'system',
      });
    } catch {
      // Expected rejection
    }

    assert.ok(capturedId);
    const record = manager.getById(capturedId);
    assert.ok(record);
    assert.strictEqual(record!.status, 'DENIED');
  });

  it('rejects approval on expired requests', () => {
    const manager = new ApprovalManager(policy, approvalRepo);
    const id = 'appr_expired_test';
    const pastTime = new Date(Date.now() - 10000).toISOString();

    approvalRepo.insert({
      id,
      tool_call_id: null,
      task_id: null,
      action: 'shell.execute',
      category: 'EXECUTE',
      risk_level: 'HIGH',
      actor: 'test',
      target: 'test',
      reason: 'test',
      metadata_json: '{}',
      status: 'PENDING',
      expires_at: pastTime,
      decided_at: null,
      decided_by: null,
      created_at: pastTime,
    });

    assert.throws(() => {
      manager.approve(id);
    }, ApprovalExpiredError);
  });
});
