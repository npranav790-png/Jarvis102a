import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { WorkspaceLockRepository } from '../database/repository.js';
import { FilesystemSandbox } from '../security/sandbox.js';
import { WorkspaceLockError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('WorkspaceManager');

export class WorkspaceManager {
  constructor(
    private lockRepo?: WorkspaceLockRepository,
    private eventBus?: EventBus
  ) {}

  /**
   * Acquires a lock on a workspace path to prevent conflicting concurrent modifications.
   */
  public acquireLock(workspacePath: string, taskId: string, agentId: string, durationSeconds: number = 300): void {
    const canonicalPath = path.resolve(workspacePath);

    if (this.lockRepo) {
      const activeLock = this.lockRepo.findActiveLock(canonicalPath);
      if (activeLock && activeLock.task_id !== taskId) {
        throw new WorkspaceLockError(canonicalPath, activeLock.task_id);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();
      const lockId = `lock_${crypto.randomUUID().slice(0, 8)}`;

      const acquired = this.lockRepo.acquire({
        id: lockId,
        workspace_path: canonicalPath,
        task_id: taskId,
        agent_id: agentId,
        acquired_at: now.toISOString(),
        expires_at: expiresAt,
      });

      if (!acquired) {
        throw new WorkspaceLockError(canonicalPath, taskId);
      }
    }

    if (this.eventBus) {
      this.eventBus.emit(
        createEvent('workspace:lock_acquired', 'WorkspaceManager', {
          workspacePath: canonicalPath,
          taskId,
          agentId,
        }, taskId)
      );
    }
  }

  /**
   * Releases an acquired lock on a workspace path.
   */
  public releaseLock(workspacePath: string, taskId: string): void {
    const canonicalPath = path.resolve(workspacePath);
    if (this.lockRepo) {
      this.lockRepo.release(canonicalPath, taskId);
    }

    if (this.eventBus) {
      this.eventBus.emit(
        createEvent('workspace:lock_released', 'WorkspaceManager', {
          workspacePath: canonicalPath,
          taskId,
        }, taskId)
      );
    }
  }

  /**
   * Checks if a workspace path is currently locked.
   */
  public isLocked(workspacePath: string): boolean {
    if (!this.lockRepo) return false;
    const canonicalPath = path.resolve(workspacePath);
    return this.lockRepo.findActiveLock(canonicalPath) !== null;
  }

  /**
   * Creates a temporary isolated workspace for scratchpad tasks.
   */
  public createTempWorkspace(prefix: string = 'jarvis_temp_'): string {
    const tempDir = path.resolve(process.cwd(), 'data', 'temp', `${prefix}${Date.now()}_${crypto.randomUUID().slice(0, 6)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    return tempDir;
  }

  /**
   * Resolves and secures a path within a workspace root.
   */
  public resolveSecurePath(targetPath: string, rootPath: string): string {
    return FilesystemSandbox.resolveSecurePath(targetPath, rootPath);
  }
}
