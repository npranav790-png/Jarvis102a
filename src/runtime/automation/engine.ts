import { JarvisEngine } from '../../core/engine.js';
import { AutomationRepository } from '../../database/runtime-repository.js';
import { JobQueue } from '../jobs/queue.js';
import { rootLogger } from '../../logging/logger.js';
import { createEvent, JarvisEvent } from '../../events/types.js';

const logger = rootLogger.child('AutomationEngine');

export class AutomationEngine {
  private MAX_AUTOMATION_DEPTH = 5;

  constructor(
    private engine: JarvisEngine,
    private repository: AutomationRepository,
    private queue: JobQueue
  ) {
    this.registerEventTriggers();
  }

  private registerEventTriggers(): void {
    // Listen to ALL events and match them against EVENT automations
    this.engine.eventBus.subscribeAll(async (event: JarvisEvent) => {
      // Loop protection: Check depth via some causation chain if we had it
      // For now, simple depth check if we passed it in metadata (omitted in basic MVP)
      await this.handleEvent(event);
    });
  }

  private async handleEvent(event: JarvisEvent): Promise<void> {
    try {
      const automations = this.repository.listEnabled();
      for (const auto of automations) {
        if (auto.trigger_type === 'EVENT') {
          const config = JSON.parse(auto.trigger_config_json);
          if (config.eventType === event.type || config.eventType === '*') {
            
            // Loop protection: Check causation chain
            // If the event was caused by this automation, we might skip to prevent loops
            if (event.causationId === auto.id) {
               logger.warn(`Automation loop detected for ${auto.id}. Skipping.`);
               await this.engine.eventBus.emit(createEvent('automation:loop_blocked', 'AutomationEngine', { automationId: auto.id }, { correlationId: event.id }));
               continue;
            }

            logger.info(`Automation ${auto.name} triggered by event ${event.type}`);
            await this.engine.eventBus.emit(createEvent('automation:started', 'AutomationEngine', { automationId: auto.id }, { correlationId: event.id }));

            // Enqueue the actions as jobs
            const actions = JSON.parse(auto.actions_json);
            for (const action of actions) {
              await this.queue.enqueue({
                automationId: auto.id,
                type: action.type,
                priority: 3,
                payload: { ...action.payload, eventPayload: event.payload },
                maxAttempts: 3,
                recoveryPolicy: 'FAIL_SAFE'
              });
            }
          }
        }
      }
    } catch (err) {
      logger.error('Error handling event for automation', undefined, err instanceof Error ? err : new Error(String(err)));
    }
  }
}
