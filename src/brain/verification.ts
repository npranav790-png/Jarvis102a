import crypto from 'node:crypto';
import { VerificationRepository, VerificationRecord } from '../database/repository.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { VerificationStatus, VerificationResult } from './types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('VerificationEngine');

export interface EvaluateVerificationInput {
  planId: string;
  stepId?: string;
  objective: string;
  criteria: string[];
  evidence: string[];
}

export class VerificationEngine {
  constructor(
    private verificationRepo: VerificationRepository,
    private eventBus: EventBus
  ) {}

  /**
   * Evaluates evidence against success criteria and produces an auditable verification result.
   */
  public async verify(input: EvaluateVerificationInput): Promise<VerificationResult> {
    const id = `ver_${crypto.randomUUID().slice(0, 8)}`;
    logger.debug(`Starting verification [id=${id}, plan=${input.planId}] for "${input.objective}"`);

    await this.eventBus.emit(
      createEvent('brain:verification_started', 'VerificationEngine', {
        verificationId: id,
        planId: input.planId,
        stepId: input.stepId,
      })
    );

    let status: VerificationStatus;
    let reasoning: string;

    // Check evidence for failure signals (excluding false positives like "0 errors", "no errors")
    const hasFailures = input.evidence.some(e => {
      const sanitized = e.replace(/0\s+errors?|no\s+errors?|without\s+errors?/gi, '');
      return /\b(fail|failed|failure|error|errors|fatal|exception|denied|timeout)\b/i.test(sanitized);
    });
    const hasSuccesses = input.evidence.some(e => /success|completed|passed|created|verified|ok/i.test(e));

    if (hasFailures) {
      status = 'FAILED';
      reasoning = `Verification failed due to explicit error signals in evidence: ${input.evidence.filter(e => {
        const sanitized = e.replace(/0\s+errors?|no\s+errors?|without\s+errors?/gi, '');
        return /\b(fail|failed|failure|error|errors|fatal|exception|denied|timeout)\b/i.test(sanitized);
      }).join('; ')}`;
    } else if (hasSuccesses && input.evidence.length >= input.criteria.length) {
      status = 'VERIFIED';
      reasoning = `All ${input.criteria.length} criteria verified by affirmative execution evidence.`;
    } else if (hasSuccesses || input.evidence.length > 0) {
      status = 'PARTIALLY_VERIFIED';
      reasoning = `Partial evidence collected (${input.evidence.length} items for ${input.criteria.length} criteria).`;
    } else {
      status = 'UNVERIFIED';
      reasoning = `Insufficient evidence available to conclusively verify completion.`;
    }

    const now = new Date().toISOString();
    const result: VerificationResult = {
      id,
      planId: input.planId,
      stepId: input.stepId ?? null,
      status,
      evidence: input.evidence,
      reasoning,
      timestamp: now,
    };

    // Store record
    const record: VerificationRecord = {
      id,
      plan_id: input.planId,
      step_id: input.stepId ?? null,
      status,
      evidence_json: JSON.stringify(input.evidence),
      reasoning,
      created_at: now,
    };
    this.verificationRepo.insert(record);

    await this.eventBus.emit(
      createEvent('brain:verification_completed', 'VerificationEngine', {
        verificationId: id,
        planId: input.planId,
        status,
      })
    );

    logger.info(`Verification completed [${status}] for plan '${input.planId}': ${reasoning}`);
    return result;
  }
}
