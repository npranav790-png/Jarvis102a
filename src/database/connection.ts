import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('DatabaseConnection');

export class DatabaseConnection {
  private db: DatabaseSync | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  public connect(): DatabaseSync {
    if (this.db) {
      return this.db;
    }

    try {
      if (this.dbPath !== ':memory:') {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      this.db = new DatabaseSync(this.dbPath);

      // Enable foreign keys and performance optimizations
      this.db.exec('PRAGMA foreign_keys = ON;');
      if (this.dbPath !== ':memory:') {
        this.db.exec('PRAGMA journal_mode = WAL;');
      }

      logger.debug(`Connected to SQLite database: ${this.dbPath}`);
      return this.db;
    } catch (err) {
      throw new DatabaseError(`Failed to connect to database at ${this.dbPath}`, undefined, err as Error);
    }
  }

  public getDb(): DatabaseSync {
    if (!this.db) {
      return this.connect();
    }
    return this.db;
  }

  public close(): void {
    if (this.db) {
      try {
        this.db.close();
        logger.debug('Database connection closed.');
      } catch (err) {
        logger.warn('Error closing database connection', undefined, err as Error);
      } finally {
        this.db = null;
      }
    }
  }

  public getPath(): string {
    return this.dbPath;
  }
}
