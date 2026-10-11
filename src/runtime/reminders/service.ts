import crypto from 'node:crypto';
import { JarvisEngine } from '../../core/engine.js';
import { ReminderRepository } from '../../database/runtime-repository.js';
import { Reminder } from '../types.js';
import { JobQueue } from '../jobs/queue.js';
import { rootLogger } from '../../logging/logger.js';
import { createEvent } from '../../events/types.js';

const logger = rootLogger.child('ReminderService');

export class ReminderService {
  constructor(
    private engine: JarvisEngine,
    private repository: ReminderRepository,
    private queue: JobQueue
  ) {}

  public async createReminder(
    title: string,
    description: string,
    scheduledAt: string,
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL',
    timezone: string = 'UTC'
  ): Promise<Reminder> {
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      title,
      description,
      status: 'CREATED',
      priority,
      timezone,
      scheduledAt,
      createdAt: new Date().toISOString()
    };

    // Enqueue a job for this reminder
    const jobId = await this.queue.enqueue({
      type: 'DELIVER_REMINDER',
      priority: priority === 'CRITICAL' ? 1 : priority === 'HIGH' ? 2 : 3,
      payload: { reminderId: reminder.id, title, description },
      maxAttempts: 3,
      scheduledAt: reminder.scheduledAt,
      recoveryPolicy: 'FAIL_SAFE'
    });

    reminder.jobId = jobId;
    reminder.status = 'SCHEDULED';

    this.repository.create({
      id: reminder.id,
      job_id: reminder.jobId,
      title: reminder.title,
      description: reminder.description,
      status: reminder.status,
      priority: reminder.priority,
      timezone: reminder.timezone,
      scheduled_at: reminder.scheduledAt,
      created_at: reminder.createdAt,
      delivered_at: null
    });

    logger.info(`Created reminder: ${title} at ${scheduledAt}`);
    await this.engine.eventBus.emit(createEvent('reminder:created', 'ReminderService', { reminderId: reminder.id }));

    return reminder;
  }
}
