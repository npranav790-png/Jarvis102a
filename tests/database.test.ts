import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import {
  ProjectRepository,
  SessionRepository,
  TaskRepository,
  EventRepository,
  AuditRepository,
} from '../dist/database/repository.js';

describe('Database & Repositories', () => {
  it('connects to in-memory database and initializes schema', () => {
    const conn = new DatabaseConnection(':memory:');
    const db = conn.connect();
    assert.doesNotThrow(() => initializeSchema(db));

    // Verify tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('projects'));
    assert.ok(tableNames.includes('sessions'));
    assert.ok(tableNames.includes('tasks'));
    assert.ok(tableNames.includes('events'));
    assert.ok(tableNames.includes('audit_logs'));

    conn.close();
  });

  it('performs CRUD operations across all repositories', () => {
    const conn = new DatabaseConnection(':memory:');
    const db = conn.connect();
    initializeSchema(db);

    const projectRepo = new ProjectRepository(db);
    const sessionRepo = new SessionRepository(db);
    const taskRepo = new TaskRepository(db);
    const eventRepo = new EventRepository(db);
    const auditRepo = new AuditRepository(db);

    const now = new Date().toISOString();

    // 1. Projects
    projectRepo.insert({
      id: 'p1',
      name: 'Test Project',
      description: 'A test project',
      root_path: 'C:/test',
      metadata_json: '{}',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    });
    const proj = projectRepo.getById('p1');
    assert.ok(proj);
    assert.strictEqual(proj.name, 'Test Project');

    // 2. Sessions
    sessionRepo.insert({
      id: 's1',
      project_id: 'p1',
      title: 'Session 1',
      metadata_json: '{}',
      status: 'ACTIVE',
      created_at: now,
      last_active_at: now,
    });
    const sess = sessionRepo.getById('s1');
    assert.ok(sess);
    assert.strictEqual(sess.title, 'Session 1');

    // 3. Tasks
    taskRepo.insert({
      id: 't1',
      parent_task_id: null,
      session_id: 's1',
      project_id: 'p1',
      title: 'Task 1',
      description: 'Do something',
      type: 'GENERAL',
      status: 'CREATED',
      priority: 5,
      input_json: '{"test":1}',
      output_json: null,
      error_json: null,
      retry_count: 0,
      max_retries: 3,
      metadata_json: '{}',
      created_at: now,
      started_at: null,
      completed_at: null,
      updated_at: now,
    });
    const task = taskRepo.getById('t1');
    assert.ok(task);
    assert.strictEqual(task.title, 'Task 1');

    // 4. Events
    eventRepo.insert({
      id: 'e1',
      event_type: 'task:created',
      source: 'Test',
      correlation_id: 'c1',
      payload_json: '{"status":"ok"}',
      timestamp: now,
    });
    const events = eventRepo.list();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].id, 'e1');

    // 5. Audit Logs
    auditRepo.insert({
      id: 'a1',
      action: 'file:write',
      risk_level: 'MEDIUM',
      actor: 'test-user',
      target: 'file.txt',
      decision: 'APPROVED',
      metadata_json: '{}',
      timestamp: now,
    });
    const audits = auditRepo.list();
    assert.strictEqual(audits.length, 1);
    assert.strictEqual(audits[0].decision, 'APPROVED');

    conn.close();
  });
});
