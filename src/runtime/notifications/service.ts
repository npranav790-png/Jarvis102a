import crypto from 'node:crypto';
import { JarvisEngine } from '../../core/engine.js';
import { NotificationRepository } from '../../database/runtime-repository.js';
import { Notification, NotificationType, NotificationPriority } from '../types.js';
import { rootLogger } from '../../logging/logger.js';
import { createEvent } from '../../events/types.js';

const logger = rootLogger.child('NotificationService');

export class NotificationService {
  constructor(
    private engine: JarvisEngine,
    private repository: NotificationRepository
  ) {}

  public async createNotification(
    type: NotificationType,
    title: string,
    body: string,
    priority: NotificationPriority = 'NORMAL',
    metadata?: Record<string, unknown>
  ): Promise<Notification> {
    const notification: Notification = {
      id: crypto.randomUUID(),
      type,
      title,
      body,
      priority,
      metadata,
      createdAt: new Date().toISOString()
    };

    this.repository.create({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      metadata_json: JSON.stringify(notification.metadata || {}),
      created_at: notification.createdAt,
      read_at: null,
      delivered_at: null
    });

    logger.info(`Created notification: [${priority}] ${title}`);
    await this.engine.eventBus.emit(createEvent('notification:created', 'NotificationService', { notificationId: notification.id }));
    
    // Abstract transport logic here
    await this.deliver(notification);

    return notification;
  }

  private async deliver(notification: Notification): Promise<void> {
    try {
      // MVP: In a real system, this pushes to WebSockets or an OS notification layer.
      // For now, we just log it and emit an event.
      logger.info(`Delivering notification: ${notification.title} - ${notification.body}`);
      await this.engine.eventBus.emit(createEvent('notification:delivered', 'NotificationService', { notificationId: notification.id }));
    } catch (err) {
      logger.error('Failed to deliver notification', undefined, err instanceof Error ? err : new Error(String(err)));
    }
  }
}
