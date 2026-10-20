import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { SessionRepository, MessageRepository } from '../dist/database/repository.js';
import { SessionManager } from '../dist/sessions/manager.js';

describe('Multi-Turn Session Archival & Markdown Report Export', () => {
  it('creates multi-turn session, generates Markdown report, and archives to disk', async () => {
    const testDir = path.join(os.tmpdir(), `jarvis_session_test_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    const archiveDir = path.join(testDir, 'archives');

    const conn = new DatabaseConnection(':memory:');
    const db = conn.connect();
    initializeSchema(db);

    const sessionRepo = new SessionRepository(db);
    const messageRepo = new MessageRepository(db);

    const sessionManager = new SessionManager(sessionRepo, undefined, undefined, messageRepo);

    // 1. Create session
    const session = sessionManager.createSession({
      title: 'Neural Engine Architecture Review',
      metadata: { department: 'Engineering', focus: 'Audio Spectrum' },
    });

    assert.ok(session.id);
    assert.strictEqual(session.title, 'Neural Engine Architecture Review');
    assert.strictEqual(session.status, 'ACTIVE');

    // 2. Add multi-turn conversation
    const t1 = new Date(Date.now() - 60000).toISOString();
    const t2 = new Date().toISOString();

    messageRepo.insert({
      id: 'msg_u1',
      session_id: session.id,
      role: 'user',
      content: 'JARVIS, what is the frequency range of the bass band in the NeuralCore visualizer?',
      task_id: null,
      metadata_json: '{}',
      created_at: t1,
    });

    messageRepo.insert({
      id: 'msg_j1',
      session_id: session.id,
      role: 'jarvis',
      content: 'The bass band is calculated from the first 15% of FFT frequency bins, corresponding approximately to 20Hz - 250Hz.',
      task_id: 'task_fft_diag',
      metadata_json: JSON.stringify({
        tools: ['audio_analyzer', 'fft_spectrum'],
        durationMs: 42,
      }),
      created_at: t2,
    });

    // 3. Export Markdown Report
    const markdown = sessionManager.exportSessionMarkdown(session.id);

    assert.ok(markdown.includes('# 📜 JARVIS 2.0 Session Report: Neural Engine Architecture Review'));
    assert.ok(markdown.includes(`**Session ID** | \`${session.id}\``));
    assert.ok(markdown.includes('### 👤 User'));
    assert.ok(markdown.includes('what is the frequency range of the bass band'));
    assert.ok(markdown.includes('### 🤖 JARVIS'));
    assert.ok(markdown.includes('20Hz - 250Hz'));
    assert.ok(markdown.includes('🛠️ Executed Tools & Telemetry'));
    assert.ok(markdown.includes('audio_analyzer'));

    // 4. Export JSON
    const jsonData = sessionManager.exportSessionJson(session.id);
    assert.strictEqual(jsonData.count, 2);
    assert.strictEqual(jsonData.session.id, session.id);
    assert.strictEqual(jsonData.messages.length, 2);

    // 5. Save archived report
    const savedPath = sessionManager.saveArchivedReport(session.id, archiveDir);
    assert.ok(fs.existsSync(savedPath));
    const savedContent = fs.readFileSync(savedPath, 'utf-8');
    assert.strictEqual(savedContent, markdown);

    // 6. Archive session
    const archivedSession = sessionManager.archiveSession(session.id, false);
    assert.strictEqual(archivedSession.status, 'ARCHIVED');

    // 7. Unarchive session
    const unarchivedSession = sessionManager.unarchiveSession(session.id);
    assert.strictEqual(unarchivedSession.status, 'ACTIVE');

    conn.close();

    // Cleanup
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });
});
