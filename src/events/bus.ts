import { EventHandler, JarvisEvent } from './types.js';
import { rootLogger } from '../logging/logger.js';
import { EventRepository } from '../database/repository.js';

const logger = rootLogger.child('EventBus');

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private wildcardHandlers = new Set<EventHandler>();
  private eventRepository?: EventRepository;

  constructor(eventRepository?: EventRepository) {
    this.eventRepository = eventRepository;
  }

  public setEventRepository(repo: EventRepository): void {
    this.eventRepository = repo;
  }

  public subscribe<T = Record<string, unknown>>(type: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const handlersSet = this.handlers.get(type)!;
    handlersSet.add(handler as EventHandler);

    return () => {
      this.unsubscribe(type, handler as EventHandler);
    };
  }

  public subscribeAll(handler: EventHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => {
      this.wildcardHandlers.delete(handler);
    };
  }

  public unsubscribe(type: string, handler: EventHandler): void {
    const handlersSet = this.handlers.get(type);
    if (handlersSet) {
      handlersSet.delete(handler);
      if (handlersSet.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  public async emit<T = Record<string, unknown>>(event: JarvisEvent<T>): Promise<void> {
    logger.debug(`Dispatching event: [${event.type}] (id=${event.id})`, {
      eventId: event.id,
      correlationId: event.correlationId,
    });

    // 1. Persist to event journal if repository attached
    if (this.eventRepository) {
      try {
        this.eventRepository.insert({
          id: event.id,
          event_type: event.type,
          source: event.source,
          correlation_id: event.correlationId || null,
          payload_json: JSON.stringify(event.payload),
          timestamp: event.timestamp,
        });
      } catch (err) {
        logger.warn(`Failed to persist event [${event.type}] to journal`, undefined, err as Error);
      }
    }

    // 2. Gather matching handlers
    const specificHandlers = this.handlers.get(event.type) || new Set();
    const allHandlers: EventHandler[] = [...specificHandlers, ...this.wildcardHandlers];

    if (allHandlers.length === 0) {
      return;
    }

    // 3. Execute all handlers safely in parallel
    const promises = allHandlers.map(async (handler) => {
      try {
        await handler(event as JarvisEvent);
      } catch (handlerErr) {
        logger.error(
          `Unhandled error in event handler for [${event.type}]`,
          { eventId: event.id },
          handlerErr as Error
        );
      }
    });

    await Promise.all(promises);
  }

  public clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }
}
