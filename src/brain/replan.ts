import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { ReplanLimitExceededError } from '../errors/base.js';
import { Plan, BrainLimits, DEFAULT_BRAIN_LIMITS } from './types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('ReplanManager');

export class ReplanManager {
  private replanCounts = new Map<string, number>();
  private limits: BrainLimits;

  constructor(
    private eventBus: EventBus,
    limits?: Partial<BrainLimits>
  ) {
    this.limits = { ...DEFAULT_BRAIN_LIMITS, ...limits };
  }

  /**
   * Evaluates whether replanning is permissible or if loop limits have been reached.
   */
  public async recordAndAssertReplan(plan: Plan, reason: string): Promise<number> {
    const current = this.replanCounts.get(plan.id) || 0;
    const nextCount = current + 1;

    if (nextCount > this.limits.maxReplans) {
      logger.error(`Replan limit exceeded for plan '${plan.id}' (${nextCount} > ${this.limits.maxReplans})`);
      throw new ReplanLimitExceededError(this.limits.maxReplans, {
        planId: plan.id,
        attemptedReplans: nextCount,
        reason,
      });
    }

    this.replanCounts.set(plan.id, nextCount);
    plan.status = 'REPLANNED';
    plan.updatedAt = new Date().toISOString();

    await this.eventBus.emit(
      createEvent('brain:replanning', 'ReplanManager', {
        planId: plan.id,
        replanAttempt: nextCount,
        maxReplans: this.limits.maxReplans,
        reason,
      })
    );

    logger.info(`Replan approved for plan '${plan.id}' (Attempt ${nextCount}/${this.limits.maxReplans}). Reason: ${reason}`);
    return nextCount;
  }

  public getReplanCount(planId: string): number {
    return this.replanCounts.get(planId) || 0;
  }

  public reset(planId: string): void {
    this.replanCounts.delete(planId);
  }
}
