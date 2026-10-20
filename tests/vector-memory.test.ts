import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EmbeddingService } from '../dist/brain/memory/embeddings.js';
import { MemoryService } from '../dist/brain/memory/memory-service.js';
import { MemoryRepository, EventRepository } from '../dist/database/repository.js';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { EventBus } from '../dist/events/bus.js';
import { MemoryRetrievalRanker } from '../dist/brain/memory/retrieval.js';

describe('JARVIS 2.0 — Vector Embeddings & Semantic Memory', () => {
  function setupTestService() {
    const dbConn = new DatabaseConnection(':memory:');
    const db = dbConn.connect();
    initializeSchema(db);
    const memoryRepo = new MemoryRepository(db);
    const eventRepo = new EventRepository(db);
    const eventBus = new EventBus(eventRepo);
    const memoryService = new MemoryService(memoryRepo, eventBus);
    return { dbConn, memoryService };
  }

  it('1. EmbeddingService produces normalized vectors with accurate cosine similarity', async () => {
    const service = new EmbeddingService();

    const vecA = await service.generateEmbedding('TypeScript backend architecture');
    const vecB = await service.generateEmbedding('TypeScript backend server design');
    const vecC = await service.generateEmbedding('Gardening vegetable tomato seeds');

    assert.ok(vecA.length > 0);
    assert.strictEqual(vecA.length, vecB.length);
    assert.strictEqual(vecA.length, vecC.length);

    const simRelated = MemoryRetrievalRanker.computeCosineSimilarity(vecA, vecB);
    const simUnrelated = MemoryRetrievalRanker.computeCosineSimilarity(vecA, vecC);

    assert.ok(simRelated > simUnrelated, `Related similarity (${simRelated.toFixed(3)}) should be higher than unrelated (${simUnrelated.toFixed(3)})`);
  });

  it('2. MemoryService automatically generates and persists vector embeddings on createMemory', async () => {
    const { dbConn, memoryService } = setupTestService();

    const mem = await memoryService.createMemory({
      type: 'USER_PREFERENCE',
      subject: 'Coding Preferences',
      predicate: 'prefers',
      content: 'User strongly prefers TypeScript with strict mode enabled.',
      importance: 'HIGH',
    });

    assert.ok(mem.embedding, 'Memory should have auto-generated embedding vector');
    assert.ok(Array.isArray(mem.embedding));
    assert.ok(mem.embedding.length > 0);

    // Retrieve from repository to verify persistence in metadata_json
    const persisted = memoryService.getMemory(mem.id);
    assert.ok(persisted.embedding);
    assert.strictEqual(persisted.embedding.length, mem.embedding.length);

    dbConn.close();
  });

  it('3. MemoryService.search ranks semantically relevant memories to the top via vector similarity', async () => {
    const { dbConn, memoryService } = setupTestService();

    await memoryService.createMemory({
      type: 'SEMANTIC',
      subject: 'Frontend 3D Visualizer',
      content: 'React with Three.js graphics was chosen for the holographic HUD rendering.',
      importance: 'NORMAL',
    });

    await memoryService.createMemory({
      type: 'SEMANTIC',
      subject: 'Database Configuration',
      content: 'SQLite with Write-Ahead Logging WAL mode is used for embedded persistence.',
      importance: 'NORMAL',
    });

    // Semantic query asking about 3D graphics in the HUD
    const results = await memoryService.search('3D graphics scene visualizer');

    assert.ok(results.length >= 1);
    assert.ok(results[0].memory.content.includes('Three.js'), 'Top result should be the Three.js 3D rendering memory');

    dbConn.close();
  });
});

