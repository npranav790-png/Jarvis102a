import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventBus } from '../dist/events/bus.js';
import { createEvent } from '../dist/events/types.js';

describe('Event Bus System', () => {
  it('dispatches typed events to specific subscribers', async () => {
    const bus = new EventBus();
    const received: string[] = [];

    bus.subscribe('task:created', (event) => {
      received.push(event.id);
    });

    const event1 = createEvent('task:created', 'test', { info: 'sample' });
    const event2 = createEvent('task:completed', 'test', { info: 'sample' });

    await bus.emit(event1);
    await bus.emit(event2);

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0], event1.id);
  });

  it('supports wildcard handlers and unsubscribing', async () => {
    const bus = new EventBus();
    let count = 0;

    const unsubscribe = bus.subscribeAll(() => {
      count++;
    });

    await bus.emit(createEvent('event:one', 'test', {}));
    await bus.emit(createEvent('event:two', 'test', {}));
    assert.strictEqual(count, 2);

    unsubscribe();
    await bus.emit(createEvent('event:three', 'test', {}));
    assert.strictEqual(count, 2);
  });

  it('isolates subscriber errors without crashing other subscribers', async () => {
    const bus = new EventBus();
    let secondHandlerRan = false;

    bus.subscribe('test:error', () => {
      throw new Error('Failing subscriber');
    });

    bus.subscribe('test:error', () => {
      secondHandlerRan = true;
    });

    await assert.doesNotReject(async () => {
      await bus.emit(createEvent('test:error', 'test', {}));
    });

    assert.strictEqual(secondHandlerRan, true);
  });
});
