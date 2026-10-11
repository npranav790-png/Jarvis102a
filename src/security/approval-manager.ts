import crypto from 'node:crypto';
import { ActionCategory, RiskLevel, ApprovalRequest, ApprovalDecision, ApproverHandler } from './types.js';
import { SecurityPolicy } from './policy.js';
import { ApprovalRepository, ApprovalDbRecord } from '../database/repository.js';
import { ApprovalRejectedError, ApprovalExpiredError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { AuditLogger } from './audit.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('ApprovalManager');

export type ApprovalPolicyMode = 'AUTO' | 'ASK' | 'ALWAYS_ASK' | 'DENY';

export interface ScopedApprovalKey {
  taskId?: string;
  projectId?: string;
  toolName?: string;
  category?: ActionCategory;
}

export class ApprovalManager {
  private customApprover?: ApproverHandler;
  private defaultTtlSeconds: number = 300; // 5 minutes
  private scopedApprovals = new Map<string, { expiresAt: number; category: ActionCategory }>();

  constructor(
    private policy: SecurityPolicy,
    private approvalRepo?: ApprovalRepository,
    private eventBus?: EventBus,
    private auditLogger?: AuditLogger
  ) {}

  public setApprover(handler: ApproverHandler): void {
    this.customApprover = handler;
  }

  public setTtl(seconds: number): void {
    this.defaultTtlSeconds = seconds;
  }

  /**
   * Evaluates action risk, checks scoped approvals, and requests interactive approval if needed.
   */
  public async evaluateAndRequestApproval(params: {
    action: string;
    category: ActionCategory;
    riskLevel?: RiskLevel;
    actor: string;
    target: string;
    reason?: string;
    taskId?: string;
    toolCallId?: string;
    projectId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    const risk = params.riskLevel || this.policy.getDefaultRiskForCategory(params.category);
    const requiresApproval = this.policy.requiresApproval(risk);

    // 1. Check scoped approvals (e.g. user already granted permission for this task)
    if (params.taskId && this.isScopeApproved(params.taskId, params.category)) {
      logger.info(`Action '${params.action}' auto-approved by active scoped task approval for task '${params.taskId}'`);
      return true;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.defaultTtlSeconds * 1000).toISOString();
    const requestId = `appr_${crypto.randomUUID().slice(0, 8)}`;

    const approvalRecord: ApprovalDbRecord = {
      id: requestId,
      tool_call_id: params.toolCallId ?? null,
      task_id: (params.taskId && params.taskId !== 'general') ? params.taskId : null,
      action: params.action,
      category: params.category,
      risk_level: risk,
      actor: params.actor,
      target: params.target,
      reason: params.reason || '',
      metadata_json: JSON.stringify(params.metadata || {}),
      status: 'PENDING',
      expires_at: expiresAt,
      decided_at: null,
      decided_by: null,
      created_at: now.toISOString(),
    };

    if (this.approvalRepo) {
      this.approvalRepo.insert(approvalRecord);
    }

    if (!requiresApproval) {
      logger.debug(`Action auto-approved: ${params.action} (risk=${risk})`);
      if (this.approvalRepo) {
        this.approvalRepo.update({
          ...approvalRecord,
          status: 'APPROVED',
          decided_at: now.toISOString(),
          decided_by: 'system:policy_auto',
        });
      }
      if (this.auditLogger) {
        this.auditLogger.log({
          action: params.action,
          riskLevel: risk,
          actor: params.actor,
          target: params.target,
          decision: 'APPROVED',
          metadata: { ...params.metadata, autoApproved: true },
        });
      }
      return true;
    }

    logger.warn(`Action requires approval: ${params.action} [id=${requestId}] (risk=${risk}, actor=${params.actor})`);

    const approvalRequest: ApprovalRequest = {
      id: requestId,
      action: params.action,
      category: params.category,
      riskLevel: risk,
      actor: params.actor,
      target: params.target,
      reason: params.reason,
      metadata: params.metadata,
      timestamp: now.toISOString(),
    };

    if (this.eventBus) {
      await this.eventBus.emit(
        createEvent('approval:requested', 'ApprovalManager', approvalRequest, params.taskId)
      );
    }

    let decision = false;
    if (this.customApprover) {
      try {
        decision = await this.customApprover(approvalRequest);
      } catch (err) {
        logger.error(`Error evaluating custom approver for ${params.action}`, undefined, err as Error);
        decision = false;
      }

      const decisionStr: ApprovalDecision = decision ? 'APPROVED' : 'DENIED';

      if (this.approvalRepo) {
        this.approvalRepo.update({
          ...approvalRecord,
          status: decisionStr,
          decided_at: new Date().toISOString(),
          decided_by: decision ? 'user:approver' : 'system:denied',
        });
      }

      if (this.auditLogger) {
        this.auditLogger.log({
          action: params.action,
          riskLevel: risk,
          actor: params.actor,
          target: params.target,
          decision: decisionStr,
          metadata: { ...params.metadata, autoApproved: false },
        });
      }

      if (this.eventBus) {
        await this.eventBus.emit(
          createEvent(
            decision ? 'approval:granted' : 'approval:denied',
            'ApprovalManager',
            { request: approvalRequest, decision: decisionStr },
            params.taskId
          )
        );
      }

      if (!decision) {
        throw new ApprovalRejectedError(params.action, `Action with risk level ${risk} was not approved.`);
      }

      return true;
    }

    // Interactive web/client mode: Action is queued in PENDING state awaiting human approval via UI/API
    logger.info(`Action queued for human operator authorization: ${params.action} [id=${requestId}]`);
    throw new ApprovalRejectedError(params.action, `Action with risk level ${risk} requires human approval (queued: ${requestId}).`);
  }

  /**
   * Grants scoped approval for a task to perform a specific category of actions without prompting each time.
   */
  public grantScopeApproval(taskId: string, category: ActionCategory, durationSeconds: number = 600): void {
    const key = `${taskId}:${category}`;
    this.scopedApprovals.set(key, {
      expiresAt: Date.now() + durationSeconds * 1000,
      category,
    });
    logger.info(`Granted scoped approval for task '${taskId}' (category=${category}, duration=${durationSeconds}s)`);
  }

  private isScopeApproved(taskId: string, category: ActionCategory): boolean {
    const key = `${taskId}:${category}`;
    const scoped = this.scopedApprovals.get(key);
    if (!scoped) return false;
    if (Date.now() > scoped.expiresAt) {
      this.scopedApprovals.delete(key);
      return false;
    }
    return true;
  }

  public approve(id: string, decidedBy: string = 'user'): ApprovalDbRecord {
    if (!this.approvalRepo) throw new Error('ApprovalRepository not configured');
    const record = this.approvalRepo.findById(id);
    if (!record) throw new ApprovalRejectedError(id, `Approval request '${id}' not found.`);

    if (record.status !== 'PENDING') {
      throw new ApprovalRejectedError(id, `Approval request '${id}' is already ${record.status}.`);
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      this.approvalRepo.update({ ...record, status: 'EXPIRED' });
      throw new ApprovalExpiredError(id);
    }

    const updated: ApprovalDbRecord = {
      ...record,
      status: 'APPROVED',
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
    };
    this.approvalRepo.update(updated);

    if (this.eventBus) {
      this.eventBus.emit(
        createEvent('approval:granted', 'ApprovalManager', { approvalId: id, decidedBy })
      );
    }
    return updated;
  }

  public deny(id: string, decidedBy: string = 'user', reason?: string): ApprovalDbRecord {
    if (!this.approvalRepo) throw new Error('ApprovalRepository not configured');
    const record = this.approvalRepo.findById(id);
    if (!record) throw new ApprovalRejectedError(id, `Approval request '${id}' not found.`);

    if (record.status !== 'PENDING') {
      throw new ApprovalRejectedError(id, `Approval request '${id}' is already ${record.status}.`);
    }

    const updated: ApprovalDbRecord = {
      ...record,
      status: 'DENIED',
      reason: reason || record.reason,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
    };
    this.approvalRepo.update(updated);

    if (this.eventBus) {
      this.eventBus.emit(
        createEvent('approval:denied', 'ApprovalManager', { approvalId: id, decidedBy, reason })
      );
    }
    return updated;
  }

  public listPending(): ApprovalDbRecord[] {
    if (!this.approvalRepo) return [];
    this.approvalRepo.expireOlderThan(new Date().toISOString());
    return this.approvalRepo.listPending();
  }

  public getById(id: string): ApprovalDbRecord | null {
    if (!this.approvalRepo) return null;
    return this.approvalRepo.findById(id);
  }
}
