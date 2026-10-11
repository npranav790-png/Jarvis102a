import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { ProjectRepository } from '../dist/database/repository.js';
import { ProjectManager } from '../dist/projects/manager.js';
import { ProjectNotFoundError, ValidationError } from '../dist/errors/base.js';

describe('Project Management', () => {
  let conn: DatabaseConnection;
  let manager: ProjectManager;

  beforeEach(() => {
    conn = new DatabaseConnection(':memory:');
    const db = conn.connect();
    initializeSchema(db);
    const repo = new ProjectRepository(db);
    manager = new ProjectManager(repo);
  });

  afterEach(() => {
    conn.close();
  });

  it('creates, retrieves, and lists projects', () => {
    const p1 = manager.createProject({
      name: 'Jarvis Core',
      rootPath: './',
      description: 'The AI core',
    });

    assert.ok(p1.id.startsWith('proj_'));
    assert.strictEqual(p1.name, 'Jarvis Core');

    const fetched = manager.getProject(p1.id);
    assert.strictEqual(fetched.id, p1.id);
    assert.strictEqual(fetched.name, 'Jarvis Core');

    const list = manager.listProjects();
    assert.strictEqual(list.length, 1);
  });

  it('validates required fields', () => {
    assert.throws(() => {
      manager.createProject({ name: '', rootPath: './' });
    }, ValidationError);

    assert.throws(() => {
      manager.createProject({ name: 'Valid', rootPath: '' });
    }, ValidationError);
  });

  it('throws ProjectNotFoundError for non-existent project', () => {
    assert.throws(() => {
      manager.getProject('non-existent-id');
    }, ProjectNotFoundError);
  });
});
