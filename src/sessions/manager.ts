import crypto from 'node:crypto';
import { Session, CreateSessionInput } from './types.js';
import { SessionRecord, SessionRepository } from '../database/repository.js';
import { ProjectManager } from '../projects/manager.js';
import { SessionNotFoundError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('SessionManager');

export class SessionManager {
  constructor(
    private sessionRepo: SessionRepository,
    private projectManager?: ProjectManager,
    private eventBus?: EventBus
  ) {}

  public createSession(input: CreateSessionInput = {}): Session {
    if (input.projectId && this.projectManager) {
      // Validate that project exists
      this.projectManager.getProject(input.projectId);
    }

    const id = `sess_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const title = input.title?.trim() || `Session ${now.slice(0, 10)}`;

    const record: SessionRecord = {
      id,
      project_id: input.projectId || null,
      title,
      metadata_json: JSON.stringify(input.metadata || {}),
      status: 'ACTIVE',
      created_at: now,
      last_active_at: now,
    };

    this.sessionRepo.insert(record);
    logger.info(`Session created: "${title}" (${id})`);

    const session = this.toSession(record);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('session:created', 'SessionManager', session, id));
    }

    return session;
  }

  public getSession(id: string): Session {
    const record = this.sessionRepo.getById(id);
    if (!record) {
      throw new SessionNotFoundError(id);
    }
    return this.toSession(record);
  }

  public listSessions(projectId?: string): Session[] {
    const records = this.sessionRepo.list(projectId);
    return records.map(r => this.toSession(r));
  }

  public touchSession(id: string): void {
    this.sessionRepo.updateLastActive(id);
  }

  public closeSession(id: string): Session {
    const session = this.getSession(id);
    this.sessionRepo.updateLastActive(id);
    // Note: status update could also be done via a dedicated repo method
    logger.info(`Session closed: ${id}`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('session:closed', 'SessionManager', session, id));
    }

    return session;
  }

  private toSession(record: SessionRecord): Session {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(record.metadata_json);
    } catch {
      metadata = {};
    }

    return {
      id: record.id,
      projectId: record.project_id,
      title: record.title,
      metadata,
      status: record.status as Session['status'],
      createdAt: record.created_at,
      lastActiveAt: record.last_active_at,
    };
  }
}
