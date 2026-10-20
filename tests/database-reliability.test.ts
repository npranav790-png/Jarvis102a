import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { MemoryRepository } from '../dist/database/repository.js';
import { DatabaseBackupService } from '../dist/database/backup.js';

describe('Phase 1: Database Reliability & Hybrid Memory Search', () => {
  it('creates an atomic SQLite database snapshot and lists backups', async () => {
    const testDir = path.join(os.tmpdir(), `jarvis_test_db_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    const dbPath = path.join(testDir, 'test_jarvis.db');
    const backupDir = path.join(testDir, 'backups');

    const conn = new DatabaseConnection(dbPath);
    const db = conn.connect();
    initializeSchema(db);

    // Insert dummy record to verify data presence in snapshot
    db.prepare(`
      INSERT INTO projects (id, name, description, root_path, metadata_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('p_test', 'Snapshot Test Project', 'Desc', 'C:/test', '{}', 'ACTIVE', new Date().toISOString(), new Date().toISOString());

    const backupService = new DatabaseBackupService({ dbPath, backupDir });
    const snapshot = await backupService.createSnapshot(db, 'unit_test');

    assert.ok(snapshot);
    assert.ok(fs.existsSync(snapshot.filePath));
    assert.strictEqual(typeof snapshot.sizeBytes, 'number');
    assert.ok(snapshot.sizeBytes > 0);

    const list = backupService.listSnapshots();
    assert.ok(list.length >= 1);
    assert.strictEqual(list[0].fileName, snapshot.fileName);

    // Test restore snapshot
    const restoreResult = await backupService.restoreSnapshot(snapshot.fileName);
    assert.strictEqual(restoreResult.success, true);

    conn.close();

    // Cleanup
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('performs multi-token hybrid keyword search in MemoryRepository', () => {
    const conn = new DatabaseConnection(':memory:');
    const db = conn.connect();
    initializeSchema(db);

    const repo = new MemoryRepository(db);
    const now = new Date().toISOString();

    repo.insert({
      id: 'mem_1',
      type: 'PROJECT',
      subject: 'Architecture',
      predicate: 'uses',
      content: 'JARVIS API server runs on port 8787 using TypeScript and Express 5',
      summary: 'API Server Port',
      importance: 'HIGH',
      confidence: 1.0,
      source: 'USER',
      project_id: null,
      session_id: null,
      status: 'ACTIVE',
      expires_at: null,
      metadata_json: '{}',
      created_at: now,
      updated_at: now,
    });

    repo.insert({
      id: 'mem_2',
      type: 'WORKING',
      subject: 'NeuralCore',
      predicate: 'renders',
      content: 'Three.js 3D NeuralCore rendering loop with audio spectrum reactivity',
      summary: '3D Visualizer',
      importance: 'NORMAL',
      confidence: 0.9,
      source: 'SYSTEM',
      project_id: null,
      session_id: null,
      status: 'ACTIVE',
      expires_at: null,
      metadata_json: '{}',
      created_at: now,
      updated_at: now,
    });

    // Multi-term query with words non-adjacent: "port Express TypeScript"
    const results = repo.search('port Express TypeScript');
    assert.ok(results.length >= 1);
    assert.strictEqual(results[0].id, 'mem_1');

    // Multi-term query for 3D visualizer: "NeuralCore spectrum"
    const results2 = repo.search('NeuralCore spectrum');
    assert.ok(results2.length >= 1);
    assert.strictEqual(results2[0].id, 'mem_2');

    conn.close();
  });
});
