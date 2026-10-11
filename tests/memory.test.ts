import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { MemoryRepository, EventRepository } from '../dist/database/repository.js';
import { EventBus } from '../dist/events/bus.js';
import { MemoryService } from '../dist/brain/memory/memory-service.js';
import { MemorySanitizer } from '../dist/brain/memory/sanitizer.js';
import { MemoryRetrievalRanker } from '../dist/brain/memory/retrieval.js';
import { MockAIProvider } from '../dist/providers/mock.js';
import { SensitiveDataDetectedError, MemoryNotFoundError } from '../dist/errors/base.js';

describe('Persistent Memory Subsystem & Safety Guardrails', () => {
  function createTestService() {
    const dbConn = new DatabaseConnection(':memory:');
    const db = dbConn.connect();
    initializeSchema(db);

    const memoryRepo = new MemoryRepository(db);
    const eventRepo = new EventRepository(db);
    const eventBus = new EventBus(eventRepo);
    const memoryService = new MemoryService(memoryRepo, eventBus);

    return { dbConn, memoryService };
  }

  it('MemorySanitizer blocks attempts to store API keys and secrets', () => {
    assert.throws(
      () => MemorySanitizer.assertSafeForMemory('User key is sk-1234567890abcdef1234567890abcdef'),
      SensitiveDataDetectedError
    );

    assert.throws(
      () => MemorySanitizer.assertSafeForMemory('Groq token: gsk_abcdef1234567890abcdef1234567890'),
      SensitiveDataDetectedError
    );

    assert.throws(
      () => MemorySanitizer.assertSafeForMemory('password = "SuperSecretPassword123"'),
      SensitiveDataDetectedError
    );

    // Safe content should not throw
    assert.doesNotThrow(() => {
      MemorySanitizer.assertSafeForMemory('The project uses SQLite and TypeScript');
    });
  });

  it('manages full memory CRUD lifecycle', async () => {
    const { dbConn, memoryService } = createTestService();

    // Create
    const memory = await memoryService.createMemory({
      type: 'SEMANTIC',
      subject: 'Architecture',
      predicate: 'uses',
      content: 'JARVIS 2.0 uses Node.js 24 and SQLite',
      summary: 'Architecture summary',
      importance: 'HIGH',
    });

    assert.strictEqual(memory.type, 'SEMANTIC');
    assert.strictEqual(memory.subject, 'Architecture');
    assert.strictEqual(memory.importance, 'HIGH');

    // Get
    const fetched = memoryService.getMemory(memory.id);
    assert.strictEqual(fetched.content, memory.content);

    // Update
    const updated = await memoryService.updateMemory(memory.id, {
      importance: 'CRITICAL',
    });
    assert.strictEqual(updated.importance, 'CRITICAL');

    // Delete
    await memoryService.deleteMemory(memory.id);
    assert.throws(() => memoryService.getMemory(memory.id), MemoryNotFoundError);

    dbConn.close();
  });

  it('deduplicates near-identical memory by reinforcing existing item', async () => {
    const { dbConn, memoryService } = createTestService();

    const mem1 = await memoryService.createMemory({
      type: 'USER_PREFERENCE',
      content: 'User prefers writing code in TypeScript language',
      importance: 'NORMAL',
    });

    // Submitting nearly identical text
    const mem2 = await memoryService.createMemory({
      type: 'USER_PREFERENCE',
      content: 'User prefers writing code in TypeScript language!',
      importance: 'NORMAL',
    });

    assert.strictEqual(mem1.id, mem2.id, 'Must reinforce existing item instead of creating duplicate ID');
    assert.strictEqual(mem2.status, 'REINFORCED');

    dbConn.close();
  });

  it('resolves semantic conflicts by updating outdated memory for same subject and predicate', async () => {
    const { dbConn, memoryService } = createTestService();

    const mem1 = await memoryService.createMemory({
      type: 'PROJECT',
      subject: 'Frontend',
      predicate: 'framework',
      content: 'Project uses Vue.js for web interface',
    });

    // Conflicting update for same subject and predicate
    const mem2 = await memoryService.createMemory({
      type: 'PROJECT',
      subject: 'Frontend',
      predicate: 'framework',
      content: 'Project migrated to React for web interface',
    });

    assert.strictEqual(mem1.id, mem2.id, 'Should update same memory record on conflicting subject/predicate');
    assert.strictEqual(mem2.content, 'Project migrated to React for web interface');
    assert.strictEqual(mem2.metadata.previousContent, 'Project uses Vue.js for web interface');

    dbConn.close();
  });

  it('enforces cross-project isolation: Project A memory is not returned for Project B', async () => {
    const { dbConn, memoryService } = createTestService();
    const db = dbConn.getDb();
    db.prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('proj_alpha', 'Alpha', '/tmp', datetime('now'), datetime('now'))").run();
    db.prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('proj_beta', 'Beta', '/tmp', datetime('now'), datetime('now'))").run();

    // Create memory for Project A
    await memoryService.createMemory({
      type: 'PROJECT',
      content: 'Secret feature code for Project A alpha',
      projectId: 'proj_alpha',
    });

    // Create memory for Project B
    await memoryService.createMemory({
      type: 'PROJECT',
      content: 'Public documentation for Project B beta',
      projectId: 'proj_beta',
    });

    // Search within Project B
    const results = await memoryService.search('feature', {
      targetProjectId: 'proj_beta',
    });

    // Project A's memory must NOT be included in Project B's search
    const hasAlphaMemory = results.some(r => r.memory.projectId === 'proj_alpha');
    assert.strictEqual(hasAlphaMemory, false, 'Project A memories must not leak to Project B');

    dbConn.close();
  });

  it('expires stale memories past their expiration timestamp', async () => {
    const { dbConn, memoryService } = createTestService();

    // Memory expiring in the past
    const past = new Date(Date.now() - 3600 * 1000).toISOString();
    const expiredMem = await memoryService.createMemory({
      type: 'WORKING',
      content: 'Temporary observation',
      expiresAt: past,
    });

    // Memory expiring in the future
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const activeMem = await memoryService.createMemory({
      type: 'WORKING',
      content: 'Current working state',
      expiresAt: future,
    });

    const expiredCount = await memoryService.expireStale();
    assert.strictEqual(expiredCount, 1);

    const f1 = memoryService.getMemory(expiredMem.id);
    const f2 = memoryService.getMemory(activeMem.id);
    assert.strictEqual(f1.status, 'EXPIRED');
    assert.strictEqual(f2.status, 'ACTIVE');

    dbConn.close();
  });

  it('computes cosine similarity accurately between vectors', () => {
    const vecA = [1.0, 0.0, 0.0, 0.0];
    const vecB = [1.0, 0.0, 0.0, 0.0];
    const vecC = [0.0, 1.0, 0.0, 0.0];

    // Identical
    assert.strictEqual(MemoryRetrievalRanker.computeCosineSimilarity(vecA, vecB), 1.0);
    // Orthogonal
    assert.strictEqual(MemoryRetrievalRanker.computeCosineSimilarity(vecA, vecC), 0.0);
    // Invalid / empty
    assert.strictEqual(MemoryRetrievalRanker.computeCosineSimilarity([], vecA), 0.0);
    assert.strictEqual(MemoryRetrievalRanker.computeCosineSimilarity(vecA, [1.0, 0.0]), 0.0);
  });

  it('performs semantic vector search and ranks matches with zero lexical token overlap', async () => {
    const { dbConn, memoryService } = createTestService();

    // Memory 1: Electric vehicle preference
    const evMemory = await memoryService.createMemory({
      type: 'USER_PREFERENCE',
      subject: 'Vehicle',
      content: 'The user drives an electric sedan vehicle daily.',
      summary: 'Drives electric sedan',
      importance: 'HIGH',
      embedding: [0.95, 0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    });

    // Memory 2: IDE preference
    const ideMemory = await memoryService.createMemory({
      type: 'USER_PREFERENCE',
      subject: 'Editor',
      content: 'Prefers VSCode with dark modern themes.',
      summary: 'Dark theme editor',
      importance: 'HIGH',
      embedding: [0.0, 0.95, 0.05, 0.0, 0.0, 0.0, 0.0, 0.0],
    });

    // Query has ZERO word overlap with "The user drives an electric sedan vehicle daily"
    // Query: "Tesla Model 3 battery"
    // Query embedding points strongly in EV direction
    const queryEmbedding = [0.98, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

    const results = await memoryService.search('Tesla Model 3 battery', {
      queryEmbedding,
      maxResults: 5,
    });

    assert.ok(results.length >= 1);
    // EV memory must be ranked #1 purely via semantic vector similarity
    assert.strictEqual(results[0].memory.id, evMemory.id);
    assert.ok(results[0].score > 0.6);

    dbConn.close();
  });

  it('MockAIProvider produces deterministic normalized embeddings', async () => {
    const mock = new MockAIProvider();
    const vec = await mock.embed('Hello JARVIS');
    assert.strictEqual(vec.length, 8);

    // Verify vector is normalized (~1.0 magnitude)
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    assert.ok(Math.abs(norm - 1.0) < 0.05, `Vector magnitude should be ~1.0, got ${norm}`);

    const batch = await mock.embedBatch(['First prompt', 'Second prompt']);
    assert.strictEqual(batch.length, 2);
    assert.strictEqual(batch[0].length, 8);
    assert.strictEqual(batch[1].length, 8);
  });
});
