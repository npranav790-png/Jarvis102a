import crypto from 'node:crypto';
import { Task, CreateTaskInput, TaskFilter, TaskStatus } from './types.js';
import { TaskRecord, TaskRepository } from '../database/repository.js';
import { assertValidTransition } from './lifecycle.js';
import { TaskNotFoundError, ValidationError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('TaskManager');

export class TaskManager {
  constructor(
    private taskRepo: TaskRepository,
    private eventBus?: EventBus
  ) {}

  public createTask<TInput = Record<string, unknown>>(input: CreateTaskInput<TInput>): Task<TInput> {
    if (!input.title || input.title.trim().length === 0) {
      throw new ValidationError('Task title cannot be empty.');
    }

    if (input.parentTaskId) {
      // Ensure parent task exists
      this.getTask(input.parentTaskId);
    }

    const id = `task_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record: TaskRecord = {
      id,
      parent_task_id: input.parentTaskId || null,
      session_id: input.sessionId || null,
      project_id: input.projectId || null,
      title: input.title.trim(),
      description: input.description?.trim() || '',
      type: input.type || 'GENERAL',
      status: 'CREATED',
      priority: input.priority !== undefined ? input.priority : 5,
      input_json: JSON.stringify(input.input || {}),
      output_json: null,
      error_json: null,
      retry_count: 0,
      max_retries: input.maxRetries !== undefined ? input.maxRetries : 3,
      metadata_json: JSON.stringify(input.metadata || {}),
      created_at: now,
      started_at: null,
      completed_at: null,
      updated_at: now,
    };

    this.taskRepo.insert(record);
    logger.info(`Task created: "${record.title}" (${id}) [priority=${record.priority}]`);

    const task = this.toTask<TInput>(record);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('task:created', 'TaskManager', task, id));
    }

    return task;
  }

  public getTask<TInput = Record<string, unknown>, TOutput = Record<string, unknown>>(id: string): Task<TInput, TOutput> {
    const record = this.taskRepo.getById(id);
    if (!record) {
      throw new TaskNotFoundError(id);
    }
    return this.toTask<TInput, TOutput>(record);
  }

  public listTasks(filters: TaskFilter = {}): Task[] {
    const records = this.taskRepo.list(filters);
    return records.map(r => this.toTask(r));
  }

  public queueTask(id: string): Task {
    const current = this.getTask(id);
    assertValidTransition(id, current.status, 'QUEUED');

    this.taskRepo.update({
      id,
      status: 'QUEUED',
    });

    const updated = this.getTask(id);
    logger.debug(`Task queued: ${id}`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('task:queued', 'TaskManager', updated, id));
    }

    return updated;
  }

  public startTask(id: string): Task {
    const current = this.getTask(id);
    assertValidTransition(id, current.status, 'RUNNING');

    const now = new Date().toISOString();
    this.taskRepo.update({
      id,
      status: 'RUNNING',
      started_at: current.startedAt || now,
    });

    const updated = this.getTask(id);
    logger.info(`Task started: ${id}`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('task:started', 'TaskManager', updated, id));
    }

    return updated;
  }

  public completeTask<TOutput = Record<string, unknown>>(id: string, output?: TOutput): Task<Record<string, unknown>, TOutput> {
    const current = this.getTask(id);
    assertValidTransition(id, current.status, 'COMPLETED');

    const now = new Date().toISOString();
    this.taskRepo.update({
      id,
      status: 'COMPLETED',
      output_json: output !== undefined ? JSON.stringify(output) : null,
      completed_at: now,
    });

    const updated = this.getTask<Record<string, unknown>, TOutput>(id);
    logger.info(`Task completed: ${id}`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('task:completed', 'TaskManager', updated, id));
    }

    return updated;
  }

  public failTask(id: string, error: { code: string; message: string; details?: unknown }, allowRetry: boolean = true): Task {
    const current = this.getTask(id);
    const now = new Date().toISOString();

    if (allowRetry && current.retryCount < current.maxRetries) {
      // Auto-retry via transitioning to QUEUED
      assertValidTransition(id, current.status, 'FAILED');
      assertValidTransition(id, 'FAILED', 'QUEUED');

      this.taskRepo.update({
        id,
        status: 'QUEUED',
        retry_count: current.retryCount + 1,
        error_json: JSON.stringify(error),
      });

      const retried = this.getTask(id);
      logger.warn(`Task failed and queued for retry (${retried.retryCount}/${retried.maxRetries}): ${id}`);

      if (this.eventBus) {
        this.eventBus.emit(createEvent('task:retried', 'TaskManager', retried, id));
      }

      return retried;
    }

    // Terminal failure
    assertValidTransition(id, current.status, 'FAILED');

    this.taskRepo.update({
      id,
      status: 'FAILED',
      error_json: JSON.stringify(error),
      completed_at: now,
    });

    const failed = this.getTask(id);
    logger.error(`Task permanently failed: ${id} (${error.code}: ${error.message})`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('task:failed', 'TaskManager', failed, id));
    }

    return failed;
  }

  public cancelTask(id: string, reason?: string): Task {
    const current = this.getTask(id);
    assertValidTransition(id, current.status, 'CANCELLED');

    const now = new Date().toISOString();
    this.taskRepo.update({
      id,
      status: 'CANCELLED',
      error_json: reason ? JSON.stringify({ code: 'CANCELLED', message: reason }) : null,
      completed_at: now,
    });

    const updated = this.getTask(id);
    logger.info(`Task cancelled: ${id}`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('task:cancelled', 'TaskManager', updated, id));
    }

    return updated;
  }

  public waitApproval(id: string): Task {
    const current = this.getTask(id);
    assertValidTransition(id, current.status, 'WAITING_APPROVAL');

    this.taskRepo.update({ id, status: 'WAITING_APPROVAL' });
    const updated = this.getTask(id);
    logger.info(`Task paused waiting for approval: ${id}`);
    return updated;
  }

  public waitChild(id: string): Task {
    const current = this.getTask(id);
    assertValidTransition(id, current.status, 'WAITING_CHILD');

    this.taskRepo.update({ id, status: 'WAITING_CHILD' });
    const updated = this.getTask(id);
    logger.info(`Task paused waiting for child tasks: ${id}`);
    return updated;
  }

  public resume(id: string): Task {
    const current = this.getTask(id);
    assertValidTransition(id, current.status, 'RUNNING');

    this.taskRepo.update({ id, status: 'RUNNING' });
    const updated = this.getTask(id);
    logger.info(`Task resumed: ${id}`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('task:started', 'TaskManager', updated, id));
    }

    return updated;
  }

  private toTask<TInput = Record<string, unknown>, TOutput = Record<string, unknown>>(record: TaskRecord): Task<TInput, TOutput> {
    let input: TInput = {} as TInput;
    let output: TOutput | null = null;
    let error: { code: string; message: string; details?: unknown } | null = null;
    let metadata: Record<string, unknown> = {};

    try {
      input = JSON.parse(record.input_json);
    } catch {
      input = {} as TInput;
    }

    if (record.output_json) {
      try {
        output = JSON.parse(record.output_json);
      } catch {
        output = null;
      }
    }

    if (record.error_json) {
      try {
        error = JSON.parse(record.error_json);
      } catch {
        error = null;
      }
    }

    try {
      metadata = JSON.parse(record.metadata_json);
    } catch {
      metadata = {};
    }

    return {
      id: record.id,
      parentTaskId: record.parent_task_id,
      sessionId: record.session_id,
      projectId: record.project_id,
      title: record.title,
      description: record.description,
      type: record.type as Task['type'],
      status: record.status as TaskStatus,
      priority: record.priority,
      input,
      output,
      error,
      retryCount: record.retry_count,
      maxRetries: record.max_retries,
      metadata,
      createdAt: record.created_at,
      startedAt: record.started_at,
      completedAt: record.completed_at,
      updatedAt: record.updated_at,
    };
  }
}
