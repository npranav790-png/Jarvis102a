import crypto from 'node:crypto';
import path from 'node:path';
import { Project, CreateProjectInput, UpdateProjectInput } from './types.js';
import { ProjectRecord, ProjectRepository } from '../database/repository.js';
import { ProjectNotFoundError, ValidationError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('ProjectManager');

export class ProjectManager {
  constructor(
    private projectRepo: ProjectRepository,
    private eventBus?: EventBus
  ) {}

  public createProject(input: CreateProjectInput): Project {
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('Project name cannot be empty.');
    }
    if (!input.rootPath || input.rootPath.trim().length === 0) {
      throw new ValidationError('Project root path cannot be empty.');
    }

    const id = `proj_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const resolvedPath = path.resolve(input.rootPath);

    const record: ProjectRecord = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      root_path: resolvedPath,
      metadata_json: JSON.stringify(input.metadata || {}),
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    };

    this.projectRepo.insert(record);
    logger.info(`Project created: ${record.name} (${id}) at ${resolvedPath}`);

    const project = this.toProject(record);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('project:created', 'ProjectManager', project, id));
    }

    return project;
  }

  public getProject(id: string): Project {
    const record = this.projectRepo.getById(id);
    if (!record) {
      throw new ProjectNotFoundError(id);
    }
    return this.toProject(record);
  }

  public listProjects(): Project[] {
    const records = this.projectRepo.list();
    return records.map(r => this.toProject(r));
  }

  public updateProject(id: string, input: UpdateProjectInput): Project {
    const existing = this.getProject(id);

    const updatedRecord: Partial<ProjectRecord> & { id: string } = {
      id,
      name: input.name ? input.name.trim() : existing.name,
      description: input.description !== undefined ? input.description.trim() : existing.description,
      root_path: input.rootPath ? path.resolve(input.rootPath) : existing.rootPath,
      status: input.status || existing.status,
      metadata_json: input.metadata
        ? JSON.stringify({ ...existing.metadata, ...input.metadata })
        : JSON.stringify(existing.metadata),
    };

    this.projectRepo.update(updatedRecord);
    logger.info(`Project updated: ${id}`);

    const project = this.getProject(id);
    if (this.eventBus) {
      this.eventBus.emit(createEvent('project:updated', 'ProjectManager', project, id));
    }

    return project;
  }

  private toProject(record: ProjectRecord): Project {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(record.metadata_json);
    } catch {
      metadata = {};
    }

    return {
      id: record.id,
      name: record.name,
      description: record.description,
      rootPath: record.root_path,
      metadata,
      status: record.status as Project['status'],
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
