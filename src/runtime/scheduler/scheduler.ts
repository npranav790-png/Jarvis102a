import { JarvisEngine } from '../../core/engine.js';
import { JobQueue } from '../jobs/queue.js';
import { AutomationRepository, ReminderRepository } from '../../database/runtime-repository.js';
import { rootLogger } from '../../logging/logger.js';
import { createEvent } from '../../events/types.js';

const logger = rootLogger.child('Scheduler');

export class Scheduler {
  private running = false;
  private intervalTimer?: NodeJS.Timeout;

  constructor(
    private engine: JarvisEngine,
    private queue: JobQueue,
    private automationRepo: AutomationRepository,
    private reminderRepo: ReminderRepository
  ) {}

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    logger.info('Starting Scheduler...');
    this.poll();
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    logger.info('Scheduler stopped.');
  }

  private poll(): void {
    if (!this.running) return;
    this.checkAutomations();
    this.checkReminders();
    // Re-check every minute for cron-like scheduling
    this.intervalTimer = setTimeout(() => this.poll(), 60000); 
  }

  private checkAutomations(): void {
    try {
      const automations = this.automationRepo.listEnabled();
      for (const auto of automations) {
        if (auto.trigger_type === 'SCHEDULE' || auto.trigger_type === 'TIME') {
          // MVP: Parse basic time/cron from trigger_config_json
          // Real cron parsing would happen here. For now, we simulate matching
          // If due:
          // this.queue.enqueue({ type: 'EXECUTE_AUTOMATION', automationId: auto.id, priority: 3, ... });
        }
      }
    } catch (err) {
      logger.error('Error checking scheduled automations', undefined, err instanceof Error ? err : new Error(String(err)));
    }
  }

  private checkReminders(): void {
    try {
      // MVP: fetch due reminders and enqueue them as jobs
      // e.g. status = 'SCHEDULED' AND scheduled_at <= now()
      // Enqueue job with type: 'DELIVER_REMINDER'
    } catch (err) {
      logger.error('Error checking reminders', undefined, err instanceof Error ? err : new Error(String(err)));
    }
  }
}
