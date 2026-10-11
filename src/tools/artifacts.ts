import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ArtifactRepository, ArtifactRecord } from '../database/repository.js';
import { ToolArtifact } from './types.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('ArtifactManager');

export class ArtifactManager {
  constructor(
    private artifactRepo?: ArtifactRepository,
    private eventBus?: EventBus
  ) {}

  /**
   * Records an artifact created by a tool or agent.
   */
  public recordArtifact(params: {
    taskId?: string;
    toolCallId?: string;
    name: string;
    path: string;
    type?: string;
    metadata?: Record<string, unknown>;
  }): ToolArtifact {
    const canonicalPath = path.resolve(params.path);
    let sizeBytes = 0;
    let checksum: string | undefined;

    try {
      if (fs.existsSync(canonicalPath)) {
        const stats = fs.statSync(canonicalPath);
        sizeBytes = stats.size;
        if (stats.isFile()) {
          const content = fs.readFileSync(canonicalPath);
          checksum = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
        }
      }
    } catch (err) {
      logger.warn(`Could not compute artifact file stats for ${canonicalPath}:`, err as Record<string, unknown>);
    }

    const artifactId = `art_${crypto.randomUUID().slice(0, 8)}`;
    const artifact: ToolArtifact = {
      id: artifactId,
      name: params.name,
      type: params.type || (path.extname(canonicalPath).slice(1).toUpperCase() || 'FILE'),
      path: canonicalPath,
      sizeBytes,
      checksum,
      metadata: params.metadata,
    };

    if (this.artifactRepo) {
      const record: ArtifactRecord = {
        id: artifactId,
        task_id: params.taskId ?? null,
        tool_call_id: params.toolCallId ?? null,
        name: params.name,
        type: artifact.type,
        path: canonicalPath,
        checksum: checksum ?? null,
        size_bytes: sizeBytes,
        metadata_json: JSON.stringify(params.metadata || {}),
        created_at: new Date().toISOString(),
      };
      this.artifactRepo.insert(record);
    }

    if (this.eventBus) {
      this.eventBus.emit(
        createEvent('artifact:created', 'ArtifactManager', {
          artifactId,
          name: params.name,
          path: canonicalPath,
          sizeBytes,
          taskId: params.taskId,
        }, params.taskId)
      );
    }

    logger.info(`Artifact recorded: ${params.name} (${sizeBytes} bytes) [id=${artifactId}]`);
    return artifact;
  }

  public listByTaskId(taskId: string): ArtifactRecord[] {
    if (!this.artifactRepo) return [];
    return this.artifactRepo.listByTaskId(taskId);
  }

  public list(limit: number = 50): ArtifactRecord[] {
    if (!this.artifactRepo) return [];
    return this.artifactRepo.list(limit);
  }
}
