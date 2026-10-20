import crypto from 'node:crypto';
import { MemoryRepository, MemoryRecord } from '../../database/repository.js';
import { EventBus } from '../../events/bus.js';
import { createEvent } from '../../events/types.js';
import { MemoryNotFoundError } from '../../errors/base.js';
import {
  MemoryItem,
  MemoryType,
  MemoryImportance,
  MemoryStatus,
  MemoryFilter,
  MemoryLinkTargetType,
} from '../types.js';
import { MemorySanitizer } from './sanitizer.js';
import { MemoryRetrievalRanker, RankedMemory } from './retrieval.js';
import { EmbeddingService } from './embeddings.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('MemoryService');

export interface CreateMemoryInput {
  type: MemoryType;
  content: string;
  subject?: string;
  predicate?: string;
  summary?: string;
  importance?: MemoryImportance;
  confidence?: number;
  source?: string;
  projectId?: string | null;
  sessionId?: string | null;
  expiresAt?: string | null;
  verificationState?: import('../types.js').VerificationStatus;
  containsSecrets?: boolean;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export class MemoryService {
  private embeddingService: EmbeddingService;

  constructor(
    private memoryRepo: MemoryRepository,
    private eventBus: EventBus,
    embeddingService?: EmbeddingService
  ) {
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  /**
   * Persists a new memory after secret sanitization, deduplication, and conflict checks.
   */
  public async createMemory(input: CreateMemoryInput): Promise<MemoryItem> {
    // 1. Safety & Secret Sanitization
    MemorySanitizer.assertSafeForMemory(input.content, 'content');
    if (input.subject) MemorySanitizer.assertSafeForMemory(input.subject, 'subject');
    if (input.summary) MemorySanitizer.assertSafeForMemory(input.summary, 'summary');

    const subject = input.subject || '';
    const predicate = input.predicate || '';
    const importance = input.importance || 'NORMAL';
    const confidence = input.confidence !== undefined ? input.confidence : 1.0;
    const source = input.source || 'SYSTEM';
    const projectId = input.projectId ?? null;
    const sessionId = input.sessionId ?? null;
    const summary = input.summary || (input.content.length > 80 ? input.content.slice(0, 80) + '...' : input.content);

    // 2. Deduplication check: Check against existing memories in the same scope
    const existing = this.listMemories({
      projectId: projectId,
      type: input.type,
      status: 'ACTIVE',
      limit: 100,
    });

    for (const item of existing) {
      // Check for near-duplicate content
      const similarity = MemoryRetrievalRanker.computeSimilarity(item.content, input.content);
      if (similarity >= 0.85) {
        logger.info(`Deduplication: Near-identical memory already exists (${item.id}, sim=${similarity.toFixed(2)}). Reinforcing existing.`);
        return this.reinforceMemory(item.id);
      }

      // Check for semantic conflict (same subject and predicate, but changed content)
      if (subject && predicate && item.subject === subject && item.predicate === predicate) {
        logger.info(`Conflict resolution: Overriding outdated memory (${item.id}) for subject '${subject}' & predicate '${predicate}'.`);
        return this.updateMemory(item.id, {
          content: input.content,
          summary,
          confidence: Math.min(1.0, item.confidence + 0.1),
          source,
          updatedAt: new Date().toISOString(),
          metadata: {
            ...item.metadata,
            previousContent: item.content,
            conflictResolvedAt: new Date().toISOString(),
          },
        });
      }
    }

    const now = new Date().toISOString();
    const id = `mem_${crypto.randomUUID().slice(0, 8)}`;
    
    let embedding = input.embedding;
    if (!embedding) {
      try {
        embedding = await this.embeddingService.generateEmbedding(`${subject} ${input.content} ${summary}`);
      } catch (err: any) {
        logger.debug(`Could not generate embedding for memory: ${err.message}`);
      }
    }

    const combinedMetadata: Record<string, unknown> = {
      ...(input.metadata || {}),
      verificationState: input.verificationState,
      containsSecrets: input.containsSecrets,
    };
    if (embedding) {
      combinedMetadata.embedding = embedding;
    }
    
    const record: MemoryRecord = {
      id,
      type: input.type,
      subject,
      predicate,
      content: input.content,
      summary,
      importance,
      confidence,
      source,
      project_id: projectId,
      session_id: sessionId,
      status: 'ACTIVE',
      expires_at: input.expiresAt ?? null,
      metadata_json: JSON.stringify(combinedMetadata),
      created_at: now,
      updated_at: now,
    };

    this.memoryRepo.insert(record);
    const item = this.recordToItem(record);

    await this.eventBus.emit(
      createEvent('memory:created', 'MemoryService', {
        memoryId: item.id,
        type: item.type,
        importance: item.importance,
        projectId: item.projectId,
      })
    );

    logger.debug(`Stored persistent memory: ${item.id} [${item.type}] "${summary}"`);
    return item;
  }

  public getMemory(id: string): MemoryItem {
    const record = this.memoryRepo.findById(id);
    if (!record) {
      throw new MemoryNotFoundError(id);
    }
    return this.recordToItem(record);
  }

  public async updateMemory(id: string, patch: Partial<MemoryItem>): Promise<MemoryItem> {
    const existing = this.getMemory(id);

    if (patch.content) MemorySanitizer.assertSafeForMemory(patch.content, 'content');
    if (patch.subject) MemorySanitizer.assertSafeForMemory(patch.subject, 'subject');

    const combinedMetadata = {
      ...existing.metadata,
      ...(patch.metadata || {})
    };
    if (patch.verificationState !== undefined) combinedMetadata.verificationState = patch.verificationState;
    if (patch.containsSecrets !== undefined) combinedMetadata.containsSecrets = patch.containsSecrets;
    if (patch.embedding !== undefined) combinedMetadata.embedding = patch.embedding;

    const updatedRecord: MemoryRecord = {
      id: existing.id,
      type: patch.type ?? existing.type,
      subject: patch.subject ?? existing.subject,
      predicate: patch.predicate ?? existing.predicate,
      content: patch.content ?? existing.content,
      summary: patch.summary ?? existing.summary,
      importance: patch.importance ?? existing.importance,
      confidence: patch.confidence ?? existing.confidence,
      source: patch.source ?? existing.source,
      project_id: patch.projectId !== undefined ? patch.projectId : existing.projectId,
      session_id: patch.sessionId !== undefined ? patch.sessionId : existing.sessionId,
      status: patch.status ?? existing.status,
      expires_at: patch.expiresAt !== undefined ? patch.expiresAt : existing.expiresAt,
      metadata_json: JSON.stringify(combinedMetadata),
      created_at: existing.createdAt,
      updated_at: new Date().toISOString(),
    };

    this.memoryRepo.update(updatedRecord);
    const updatedItem = this.recordToItem(updatedRecord);

    await this.eventBus.emit(
      createEvent('memory:updated', 'MemoryService', {
        memoryId: updatedItem.id,
        type: updatedItem.type,
      })
    );

    return updatedItem;
  }

  public async deleteMemory(id: string): Promise<void> {
    this.getMemory(id); // Ensure exists
    this.memoryRepo.delete(id);

    await this.eventBus.emit(
      createEvent('memory:deleted', 'MemoryService', { memoryId: id })
    );

    logger.debug(`Deleted memory: ${id}`);
  }

  public async reinforceMemory(id: string): Promise<MemoryItem> {
    const existing = this.getMemory(id);
    const newConfidence = Math.min(1.0, existing.confidence + 0.1);
    return this.updateMemory(id, {
      confidence: newConfidence,
      status: 'REINFORCED',
      metadata: {
        ...existing.metadata,
        reinforcedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Search and rank memories matching a query.
   */
  public async search(
    query: string,
    options?: { targetProjectId?: string | null; maxResults?: number; type?: MemoryType; queryEmbedding?: number[] }
  ): Promise<RankedMemory[]> {
    // 1. Fetch candidate records from SQLite
    const raw = this.memoryRepo.search(query, {
      projectId: options?.targetProjectId,
      type: options?.type,
      limit: 100,
    });

    let queryEmbedding = options?.queryEmbedding;
    if (!queryEmbedding && query.trim().length > 0) {
      try {
        queryEmbedding = await this.embeddingService.generateEmbedding(query);
      } catch {
        // Fall back to lexical ranking
      }
    }

    // If semantic queryEmbedding is provided or keyword search returned no candidates, load active memories for semantic ranking
    if (queryEmbedding || raw.length === 0) {
      const allActive = this.memoryRepo.list({
        projectId: options?.targetProjectId,
        type: options?.type,
        status: 'ACTIVE',
        limit: 100,
      });
      const existingIds = new Set(raw.map((r) => r.id));
      for (const item of allActive) {
        if (!existingIds.has(item.id)) {
          raw.push(item);
          existingIds.add(item.id);
        }
      }
    }

    const items = raw.map(r => this.recordToItem(r));

    // 2. Rank using composite scoring (relevance + importance + recency + project isolation)
    const ranked = MemoryRetrievalRanker.rank(query, items, {
      targetProjectId: options?.targetProjectId,
      maxResults: options?.maxResults ?? 15,
      queryEmbedding,
    });

    if (ranked.length > 0) {
      await this.eventBus.emit(
        createEvent('memory:retrieved', 'MemoryService', {
          query,
          resultCount: ranked.length,
          topScore: ranked[0].score,
        })
      );
    }

    return ranked;
  }

  /**
   * Lists memories based on filters.
   */
  public listMemories(filter?: MemoryFilter): MemoryItem[] {
    const records = this.memoryRepo.list({
      projectId: filter?.projectId,
      sessionId: filter?.sessionId,
      type: filter?.type,
      status: filter?.status,
      limit: filter?.limit,
    });
    return records.map(r => this.recordToItem(r));
  }

  /**
   * Links a memory to an entity (task, plan, event, session).
   */
  public link(memoryId: string, targetType: MemoryLinkTargetType, targetId: string): void {
    const id = `mlink_${crypto.randomUUID().slice(0, 8)}`;
    this.memoryRepo.insertLink({
      id,
      memory_id: memoryId,
      target_type: targetType,
      target_id: targetId,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Expire stale memories past their expiration timestamp.
   */
  public async expireStale(): Promise<number> {
    const now = new Date().toISOString();
    const count = this.memoryRepo.expireOlderThan(now);
    if (count > 0) {
      logger.info(`Expired ${count} stale memories.`);
      await this.eventBus.emit(
        createEvent('memory:expired', 'MemoryService', { expiredCount: count })
      );
    }
    return count;
  }

  private recordToItem(r: MemoryRecord): MemoryItem {
    const metadata = JSON.parse(r.metadata_json || '{}');
    return {
      id: r.id,
      type: r.type as MemoryType,
      subject: r.subject,
      predicate: r.predicate,
      content: r.content,
      summary: r.summary,
      importance: r.importance as MemoryImportance,
      confidence: r.confidence,
      source: r.source,
      projectId: r.project_id,
      sessionId: r.session_id,
      status: r.status as MemoryStatus,
      verificationState: metadata.verificationState,
      containsSecrets: metadata.containsSecrets,
      embedding: metadata.embedding,
      expiresAt: r.expires_at,
      metadata: metadata,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
