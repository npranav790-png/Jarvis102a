import crypto from 'node:crypto';
import { ApprovalDecision, ApprovalRequest, ApproverHandler, ActionCategory, RiskLevel } from './types.js';
import { SecurityPolicy } from './policy.js';
import { ApprovalRejectedError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { AuditLogger } from './audit.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('ApprovalGatekeeper');

export class ApprovalGatekeeper {
  private customApprover?: ApproverHandler;

  constructor(
    private policy: SecurityPolicy,
    private eventBus?: EventBus,
    private auditLogger?: AuditLogger
  ) {}

  public setApprover(handler: ApproverHandler): void {
    this.customApprover = handler;
  }

  public async evaluateAndRequestApproval(params: {
    action: string;
    category: ActionCategory;
    riskLevel?: RiskLevel;
    actor: string;
    target: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    const risk = params.riskLevel || this.policy.getDefaultRiskForCategory(params.category);
    const requiresApproval = this.policy.requiresApproval(risk);

    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      action: params.action,
      category: params.category,
      riskLevel: risk,
      actor: params.actor,
      target: params.target,
      reason: params.reason,
      metadata: params.metadata,
      timestamp: new Date().toISOString(),
    };

    if (!requiresApproval) {
      logger.debug(`Action auto-approved: ${params.action} (risk=${risk})`);
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

    logger.warn(`Action requires approval: ${params.action} (risk=${risk}, actor=${params.actor})`);

    if (this.eventBus) {
      await this.eventBus.emit(
        createEvent('security:approval_requested', 'SecurityEngine', request)
      );
    }

    let decision: boolean = false;
    if (this.customApprover) {
      try {
        decision = await this.customApprover(request);
      } catch (err) {
        logger.error(`Error during approval evaluation for ${params.action}`, undefined, err as Error);
        decision = false;
      }
    } else {
      // By default in headless mode without registered approver, dangerous actions are rejected
      logger.warn(`No interactive approver registered; rejecting dangerous action: ${params.action}`);
      decision = false;
    }

    const decisionStr: ApprovalDecision = decision ? 'APPROVED' : 'DENIED';

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
          decision ? 'security:approval_granted' : 'security:approval_denied',
          'SecurityEngine',
          { request, decision: decisionStr }
        )
      );
    }

    if (!decision) {
      throw new ApprovalRejectedError(params.action, `Action with risk level ${risk} was not approved.`);
    }

    return true;
  }
}
