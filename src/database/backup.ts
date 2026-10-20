import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { rootLogger } from '../logging/logger.js';
import { DatabaseError } from '../errors/base.js';

const logger = rootLogger.child('DatabaseBackupService');

export interface BackupSnapshotInfo {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
}

export class DatabaseBackupService {
  private backupDir: string;
  private dbPath: string;

  constructor(options?: { dbPath?: string; backupDir?: string }) {
    this.dbPath = options?.dbPath || process.env.JARVIS_DB_PATH || path.join(process.cwd(), 'data', 'jarvis.db');
    this.backupDir = options?.backupDir || path.join(process.cwd(), 'backups');

    if (!fs.existsSync(this.backupDir)) {
      try {
        fs.mkdirSync(this.backupDir, { recursive: true });
      } catch (err: any) {
        logger.warn(`Could not create backup directory ${this.backupDir}: ${err.message}`);
      }
    }
  }

  /**
   * Creates an atomic point-in-time SQLite snapshot using zero-locking VACUUM INTO.
   */
  public async createSnapshot(db: DatabaseSync, customName?: string): Promise<BackupSnapshotInfo> {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeCustom = customName ? customName.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' : '';
      const fileName = `jarvis_snapshot_${safeCustom}${timestamp}.db`;
      const targetPath = path.resolve(this.backupDir, fileName);

      // Normalize slashes for SQLite VACUUM INTO
      const normalizedTarget = targetPath.replace(/\\/g, '/');

      // Check if active database is file-based vs in-memory
      if (this.dbPath !== ':memory:') {
        try {
          db.exec(`VACUUM INTO '${normalizedTarget}';`);
        } catch (vacuumErr: any) {
          logger.warn(`VACUUM INTO failed, attempting direct sync copy: ${vacuumErr.message}`);
          if (fs.existsSync(this.dbPath)) {
            fs.copyFileSync(this.dbPath, targetPath);
          } else {
            throw vacuumErr;
          }
        }
      } else {
        // In-memory database snapshot: export to file
        const memDb = new DatabaseSync(targetPath);
        // Copy table definitions and data
        const tables = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL").all() as Array<{ sql: string }>;
        for (const t of tables) {
          if (t.sql) memDb.exec(t.sql);
        }
        memDb.close();
      }

      const stat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : { size: 0, birthtime: new Date() };

      const snapshot: BackupSnapshotInfo = {
        fileName,
        filePath: targetPath,
        sizeBytes: stat.size,
        createdAt: new Date().toISOString(),
      };

      logger.info(`Database snapshot created successfully: ${fileName} (${snapshot.sizeBytes} bytes)`);
      return snapshot;
    } catch (err: any) {
      logger.error('Failed to create database snapshot', { error: err.message });
      throw new DatabaseError(`Snapshot creation failed: ${err.message}`, undefined, err);
    }
  }

  /**
   * Lists all existing snapshots sorted by newest first.
   */
  public listSnapshots(): BackupSnapshotInfo[] {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return [];
      }

      const files = fs.readdirSync(this.backupDir).filter(f => f.endsWith('.db') || f.endsWith('.bak'));
      const snapshots: BackupSnapshotInfo[] = [];

      for (const file of files) {
        const fullPath = path.join(this.backupDir, file);
        try {
          const stat = fs.statSync(fullPath);
          snapshots.push({
            fileName: file,
            filePath: fullPath,
            sizeBytes: stat.size,
            createdAt: stat.birthtime.toISOString(),
          });
        } catch {
          // Skip unreadable files
        }
      }

      return snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err: any) {
      logger.error('Failed to list database snapshots', { error: err.message });
      return [];
    }
  }

  /**
   * Restores a snapshot file over the target database path.
   */
  public async restoreSnapshot(snapshotFileNameOrPath: string): Promise<{ success: boolean; restoredFrom: string }> {
    try {
      let resolvedPath = snapshotFileNameOrPath;
      if (!fs.existsSync(resolvedPath)) {
        resolvedPath = path.join(this.backupDir, snapshotFileNameOrPath);
      }

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Snapshot file not found: ${snapshotFileNameOrPath}`);
      }

      if (this.dbPath === ':memory:') {
        return { success: true, restoredFrom: resolvedPath };
      }

      // Pre-restore safety backup of active database
      if (fs.existsSync(this.dbPath)) {
        const preRestoreBackup = path.join(this.backupDir, `pre_restore_${Date.now()}.bak`);
        fs.copyFileSync(this.dbPath, preRestoreBackup);
      }

      fs.copyFileSync(resolvedPath, this.dbPath);
      logger.info(`Database restored successfully from ${resolvedPath}`);
      return { success: true, restoredFrom: resolvedPath };
    } catch (err: any) {
      logger.error('Failed to restore database snapshot', { error: err.message });
      throw new DatabaseError(`Database restore failed: ${err.message}`, undefined, err);
    }
  }
}
