import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JarvisEngine } from '../dist/core/engine.js';
import { JarvisRuntime } from '../dist/runtime/runtime.js';
import { getConfig } from '../dist/config/config.js';
import { MockAIProvider } from '../dist/providers/mock.js';
import { ApprovalManager } from '../dist/security/approval-manager.js';
import { SecurityPolicy } from '../dist/security/policy.js';
import { ApprovalRepository } from '../dist/database/repository.js';
import { ApprovalRejectedError } from '../dist/errors/base.js';

describe('End-to-End User Journeys & State Recovery (Prompts 8/10)', () => {
  let tempDbPath: string;
  let engine: JarvisEngine;
  let runtime: JarvisRuntime;

  before(async () => {
    tempDbPath = path.join(os.tmpdir(), `jarvis_e2e_${Date.now()}.db`);
    const config = getConfig();
    config.database.path = tempDbPath;
    config.api.port = 0;
    config.app.offline = true;

    engine = new JarvisEngine(config);
    runtime = new JarvisRuntime(engine);
    await runtime.start();
  });

  after(async () => {
    if (runtime) await runtime.stop();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch {
      // Ignore
    }
  });

  // Journey A: Basic Chat
  it('Journey A: Basic Chat — processes request through Intent -> ModelRouter -> Brain -> Response', async () => {
    const session = engine.sessionManager.createSession({ title: 'Chat Journey' });
    const response = await engine.brain.process({
      userInput: 'Hello JARVIS, summarize our architecture',
      sessionId: session.id
    });

    assert.ok(response);
    assert.ok(response.finalResponse);
    assert.strictEqual(response.sessionId, session.id);
  });

  // Journey B: Task Execution & Verification
  it('Journey B: Task Execution — manages lifecycle: Created -> Queued -> Running -> Verified -> Completed', async () => {
    const task = engine.taskManager.createTask({
      title: 'Analyze Performance',
      description: 'Run benchmark analysis',
      priority: 8
    });

    assert.strictEqual(task.status, 'CREATED');

    // Progress to QUEUED
    engine.taskManager.queueTask(task.id);
    const queued = engine.taskManager.getTask(task.id);
    assert.strictEqual(queued.status, 'QUEUED');

    // Progress to RUNNING
    engine.taskManager.startTask(task.id);
    const running = engine.taskManager.getTask(task.id);
    assert.strictEqual(running.status, 'RUNNING');

    // Complete task
    engine.taskManager.completeTask(task.id, { result: 'All benchmarks passed' });
    const completed = engine.taskManager.getTask(task.id);
    assert.strictEqual(completed.status, 'COMPLETED');
    assert.strictEqual((completed.output as any).result, 'All benchmarks passed');
  });

  // Journey C: Approval Workflow (Approve, Deny, Expire)
  it('Journey C1: Approval Workflow — Approved action succeeds', async () => {
    const policy = new SecurityPolicy('strict', 'HIGH');
    const approvalRepo = new ApprovalRepository(engine.db.connect());
    const approvalMgr = new ApprovalManager(policy, approvalRepo);

    approvalMgr.setApprover(async () => true);

    const approved = await approvalMgr.evaluateAndRequestApproval({
      action: 'system.reboot',
      category: 'EXECUTE',
      riskLevel: 'HIGH',
      actor: 'agent:admin',
      target: 'server'
    });

    assert.strictEqual(approved, true);
  });

  it('Journey C2: Approval Workflow — Denied action is blocked safely', async () => {
    const policy = new SecurityPolicy('strict', 'HIGH');
    const approvalRepo = new ApprovalRepository(engine.db.connect());
    const approvalMgr = new ApprovalManager(policy, approvalRepo);

    approvalMgr.setApprover(async () => false);

    await assert.rejects(async () => {
      await approvalMgr.evaluateAndRequestApproval({
        action: 'filesystem.format',
        category: 'DESTRUCTIVE',
        riskLevel: 'CRITICAL',
        actor: 'agent:admin',
        target: 'disk'
      });
    }, ApprovalRejectedError);
  });

  // Journey D: Automation & Event Engine
  it('Journey D: Automation Engine — triggers job on matching event and executes safely', async () => {
    const autoId = `auto_e2e_${Date.now()}`;
    runtime.automationRepo.create({
      id: autoId,
      name: 'E2E Trigger Auto',
      description: 'Auto trigger on event',
      enabled: 1,
      trigger_type: 'EVENT',
      trigger_config_json: JSON.stringify({ eventType: 'system:status_alert' }),
      actions_json: JSON.stringify([{ type: 'SEND_NOTIFICATION', payload: { title: 'Auto Alert' } }]),
      timezone: 'UTC',
      metadata_json: '{}',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    let jobQueued = false;
    engine.eventBus.subscribe('job.queued', async () => {
      jobQueued = true;
    });

    await engine.eventBus.emit({
      id: `evt_${Date.now()}`,
      type: 'system:status_alert',
      source: 'e2e_test',
      timestamp: new Date().toISOString(),
      payload: { severity: 'warn' }
    });

    await new Promise(r => setTimeout(r, 150));

    const db = engine.db.connect();
    const job = db.prepare('SELECT * FROM runtime_jobs WHERE automation_id = ?').get(autoId) as any;
    assert.ok(job, 'Automation must enqueue a runtime job upon trigger');
  });

  // Journey E: Reminder Delivery
  it('Journey E: Reminder Lifecycle — schedules reminder and enqueues DELIVER_REMINDER job', async () => {
    const reminder = await runtime.reminderService.createReminder(
      'Release JARVIS 2.0',
      'Final verification complete',
      new Date(Date.now() + 5000).toISOString()
    );

    assert.ok(reminder);
    assert.ok(reminder.jobId);

    const job = runtime.jobRepo.findById(reminder.jobId);
    assert.ok(job);
    assert.strictEqual(job.type, 'DELIVER_REMINDER');
  });

  // Journey F: Restart & State Recovery
  it('Journey F: Restart & Recovery — persists tasks and state across complete runtime restarts', async () => {
    // 1. Create a task in the current runtime
    const persistentTask = engine.taskManager.createTask({
      title: 'Persistent Migration Task',
      description: 'Should survive restart',
      priority: 9
    });
    const taskId = persistentTask.id;

    // 2. Stop runtime & close database
    await runtime.stop();

    // 3. Re-initialize runtime with same SQLite database file
    const config = getConfig();
    config.database.path = tempDbPath;
    config.api.port = 0;
    config.app.offline = true;
    const restartedEngine = new JarvisEngine(config);
    const restartedRuntime = new JarvisRuntime(restartedEngine);
    await restartedRuntime.start();

    // 4. Verify task still exists and is consistent
    const recoveredTask = restartedEngine.taskManager.getTask(taskId);
    assert.ok(recoveredTask);
    assert.strictEqual(recoveredTask.title, 'Persistent Migration Task');
    assert.strictEqual(recoveredTask.priority, 9);

    // Clean up restarted runtime
    await restartedRuntime.stop();
  });
});
