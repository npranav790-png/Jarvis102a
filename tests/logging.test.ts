import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Logger } from '../dist/logging/logger.js';
import type { LogRecord } from '../dist/logging/types.js';

describe('Logging System', () => {
  it('respects log level filtering', () => {
    const logs: LogRecord[] = [];
    const logger = new Logger({
      level: 'WARNING',
      sink: (_, record) => logs.push(record),
    });

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');

    assert.strictEqual(logs.length, 2);
    assert.strictEqual(logs[0].level, 'WARNING');
    assert.strictEqual(logs[1].level, 'ERROR');
  });

  it('inherits child context and redacts secrets', () => {
    const logs: LogRecord[] = [];
    const parent = new Logger({
      level: 'INFO',
      sink: (_, record) => logs.push(record),
    });

    const child = parent.child('TaskWorker', { taskId: 'task-123' });
    child.info('Processing with secret', { apiKey: 'sk-secret1234567890abcdefghijklmn' });

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].module, 'TaskWorker');
    assert.strictEqual(logs[0].context?.taskId, 'task-123');
    assert.strictEqual(logs[0].context?.apiKey, '***REDACTED***');
  });
});
