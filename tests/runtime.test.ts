import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { JarvisRuntime } from '../dist/runtime/runtime.js';
import { JarvisEngine } from '../dist/core/engine.js';
import { getConfig } from '../dist/config/config.js';

describe('JarvisRuntime (Prompt 5)', () => {
  let runtime: JarvisRuntime;

  beforeEach(async () => {
    const config = getConfig();
    config.database.path = ':memory:'; // Use in-memory DB for tests
    config.api.port = 0;
    const engine = new JarvisEngine(config);
    runtime = new JarvisRuntime(engine);
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.stop();
    }
  });

  it('should initialize and start the runtime successfully', async () => {
    await runtime.start();
    const status = runtime.getStatus();
    assert.strictEqual(status.state, 'RUNNING');
    assert.strictEqual(status.databaseHealthy, true);
    assert.strictEqual(status.schedulerRunning, true);
  });

  it('should enqueue and retrieve jobs from JobQueue', async () => {
    await runtime.start();
    
    const jobId = await runtime.jobQueue.enqueue({
      type: 'TEST_JOB',
      priority: 3,
      payload: { foo: 'bar' },
      attempts: 0,
      maxAttempts: 3,
      recoveryPolicy: 'FAIL_SAFE'
    });

    assert.ok(jobId);

    const jobRecord = runtime.jobRepo.findById(jobId);
    assert.ok(jobRecord);
    assert.strictEqual(jobRecord.type, 'TEST_JOB');
    
    // Test finding pending jobs
    const pending = runtime.jobRepo.findPendingJobs(10);
    const found = pending.find(j => j.id === jobId);
    assert.ok(found);
  });

  it('should create and trigger automations', async () => {
    await runtime.start();

    // Create a mock automation
    const autoId = 'auto-' + Date.now();
    runtime.automationRepo.create({
      id: autoId,
      name: 'Test Auto',
      description: 'A test automation',
      enabled: 1,
      trigger_type: 'EVENT',
      trigger_config_json: JSON.stringify({ eventType: 'test:trigger' }),
      actions_json: JSON.stringify([{ type: 'TEST_ACTION', payload: {} }]),
      timezone: 'UTC',
      metadata_json: '{}',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const active = runtime.automationRepo.listEnabled();
    assert.ok(active.some(a => a.id === autoId));

    // Emit event and see if job was queued
    // AutomationEngine listens to all events
    await runtime.engine.eventBus.emit({
      id: 'event-123',
      type: 'test:trigger',
      source: 'test',
      timestamp: new Date().toISOString(),
      payload: { value: 42 }
    });

    // Wait a tick for async handlers
    await new Promise(resolve => setTimeout(resolve, 150));

    // There should be a job created for the action, it might be in any state (queued, running, completed)
    const db = runtime.engine.db.connect();
    const stmt = db.prepare('SELECT * FROM runtime_jobs WHERE automation_id = ?');
    const job = stmt.get(autoId) as any;
    assert.ok(job);
    assert.strictEqual(job.type, 'TEST_ACTION');
  });

  it('should create notifications and emit events', async () => {
    await runtime.start();
    
    let notificationEventFired = false;
    runtime.engine.eventBus.subscribe('notification:created', async (event) => {
      notificationEventFired = true;
    });

    const notification = await runtime.notificationService.createNotification(
      'SYSTEM_WARNING',
      'Test Warning',
      'This is a test warning',
      'HIGH'
    );

    assert.ok(notification);
    assert.strictEqual(notification.title, 'Test Warning');
    
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.ok(notificationEventFired);
  });

  it('should create reminders and enqueue them', async () => {
    await runtime.start();

    const reminder = await runtime.reminderService.createReminder(
      'Buy Milk',
      'At the store',
      new Date(Date.now() + 10000).toISOString()
    );

    assert.ok(reminder);
    assert.ok(reminder.jobId);

    const job = runtime.jobRepo.findById(reminder.jobId);
    assert.ok(job);
    assert.strictEqual(job.type, 'DELIVER_REMINDER');
  });

  it('should register voice providers', async () => {
    await runtime.start();
    
    runtime.voiceRegistry.registerSTT({
      id: 'mock-stt',
      name: 'Mock STT',
      isLocal: true,
      transcribe: async () => ({ id: '1', voiceSessionId: '2', text: 'hello', isFinal: true, confidence: 1, provider: 'mock', createdAt: '' }),
      isAvailable: async () => true
    }, true);

    assert.strictEqual(runtime.voiceRegistry.STT.name, 'Mock STT');
  });
});
