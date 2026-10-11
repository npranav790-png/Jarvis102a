import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SecurityPolicy } from '../dist/security/policy.js';
import { ApprovalGatekeeper } from '../dist/security/approval.js';
import { ApprovalRejectedError } from '../dist/errors/base.js';

describe('Security Foundation', () => {
  it('correctly maps action risk levels and calculates approval requirements', () => {
    const policy = new SecurityPolicy('strict', 'HIGH');

    assert.strictEqual(policy.getDefaultRiskForCategory('READ'), 'LOW');
    assert.strictEqual(policy.getDefaultRiskForCategory('WRITE'), 'MEDIUM');
    assert.strictEqual(policy.getDefaultRiskForCategory('EXECUTE'), 'HIGH');
    assert.strictEqual(policy.getDefaultRiskForCategory('DESTRUCTIVE'), 'CRITICAL');

    assert.strictEqual(policy.requiresApproval('LOW'), false);
    assert.strictEqual(policy.requiresApproval('MEDIUM'), false);
    assert.strictEqual(policy.requiresApproval('HIGH'), true);
    assert.strictEqual(policy.requiresApproval('CRITICAL'), true);
  });

  it('auto-approves low-risk actions and blocks high-risk actions without approver', async () => {
    const policy = new SecurityPolicy('strict', 'HIGH');
    const gatekeeper = new ApprovalGatekeeper(policy);

    // Low risk: auto approved
    const lowRiskResult = await gatekeeper.evaluateAndRequestApproval({
      action: 'file:read',
      category: 'READ',
      actor: 'test',
      target: 'file.txt',
    });
    assert.strictEqual(lowRiskResult, true);

    // High risk: requires approval, rejected because no approver registered
    await assert.rejects(async () => {
      await gatekeeper.evaluateAndRequestApproval({
        action: 'system:execute',
        category: 'EXECUTE',
        actor: 'test',
        target: 'cmd.exe',
      });
    }, ApprovalRejectedError);
  });

  it('allows high-risk action when approved by custom approver', async () => {
    const policy = new SecurityPolicy('strict', 'HIGH');
    const gatekeeper = new ApprovalGatekeeper(policy);

    gatekeeper.setApprover(async (req) => {
      return req.target === 'allowed-target';
    });

    const approved = await gatekeeper.evaluateAndRequestApproval({
      action: 'system:execute',
      category: 'EXECUTE',
      actor: 'test',
      target: 'allowed-target',
    });
    assert.strictEqual(approved, true);

    await assert.rejects(async () => {
      await gatekeeper.evaluateAndRequestApproval({
        action: 'system:execute',
        category: 'EXECUTE',
        actor: 'test',
        target: 'forbidden-target',
      });
    }, ApprovalRejectedError);
  });
});
