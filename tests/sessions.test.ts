import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { SessionRepository, ProjectRepository } from '../dist/database/repository.js';
import { ProjectManager } from '../dist/projects/manager.js';
import { SessionManager } from '../dist/sessions/manager.js';
import { SessionNotFoundError } from '../dist/errors/base.js';

describe('Session Management', () => {
  let conn: DatabaseConnection;
  let sessionManager: SessionManager;
  let projectManager: ProjectManager;

  beforeEach(() => {
    conn = new DatabaseConnection(':memory:');
    const db = conn.connect();
    initializeSchema(db);
    const sessionRepo = new SessionRepository(db);
    const projectRepo = new ProjectRepository(db);
    projectManager = new ProjectManager(projectRepo);
    sessionManager = new SessionManager(sessionRepo, projectManager);
  });

  afterEach(() => {
    conn.close();
  });

  it('creates and manages session lifecycles', () => {
    const project = projectManager.createProject({ name: 'Workspace', rootPath: './' });
    const session = sessionManager.createSession({
      title: 'Dev Discussion',
      projectId: project.id,
    });

    assert.ok(session.id.startsWith('sess_'));
    assert.strictEqual(session.projectId, project.id);
    assert.strictEqual(session.status, 'ACTIVE');

    const fetched = sessionManager.getSession(session.id);
    assert.strictEqual(fetched.title, 'Dev Discussion');

    sessionManager.touchSession(session.id);
    const touched = sessionManager.getSession(session.id);
    assert.ok(new Date(touched.lastActiveAt).getTime() >= new Date(session.lastActiveAt).getTime());
  });

  it('throws SessionNotFoundError for missing session', () => {
    assert.throws(() => {
      sessionManager.getSession('invalid-session-id');
    }, SessionNotFoundError);
  });
});
