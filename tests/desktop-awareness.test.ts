import { describe, it } from 'node:test';
import assert from 'node:assert';
import { systemResourceMonitorTool } from '../dist/tools/builtin/resource-monitor.js';
import { systemNotificationTool } from '../dist/tools/builtin/notification.js';

describe('Phase 2: Desktop Awareness & Telemetry', () => {
  it('executes system_resource_monitor tool and extracts hardware telemetry', async () => {
    const res = await systemResourceMonitorTool.execute({
      detailed: true,
      includeDisks: true,
      includeGpu: true,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.platform);
    assert.ok(res.arch);
    assert.strictEqual(typeof res.uptimeSeconds, 'number');
    assert.ok(res.uptimeSeconds >= 0);

    // CPU telemetry validation
    assert.ok(res.cpu);
    assert.strictEqual(typeof res.cpu.model, 'string');
    assert.strictEqual(typeof res.cpu.cores, 'number');
    assert.ok(res.cpu.cores > 0);
    assert.strictEqual(typeof res.cpu.usagePercent, 'number');

    // Memory telemetry validation
    assert.ok(res.memory);
    assert.ok(res.memory.totalMb > 0);
    assert.ok(res.memory.freeMb >= 0);
    assert.ok(res.memory.usedPercent >= 0 && res.memory.usedPercent <= 100);

    // Formatted summary validation
    assert.ok(res.summary);
    assert.ok(res.summary.includes('CPU:'));
    assert.ok(res.summary.includes('RAM:'));
  });

  it('executes system_notification tool and confirms delivery', async () => {
    const res = await systemNotificationTool.execute({
      title: 'JARVIS Test Notification',
      message: 'Testing desktop awareness notification delivery',
      urgency: 'LOW',
      sound: false,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.delivered, true);
    assert.ok(res.channel === 'windows_toast' || res.channel === 'powershell_balloon' || res.channel === 'logger_fallback');
    assert.ok(res.summary.includes('JARVIS Test Notification'));
  });
});
