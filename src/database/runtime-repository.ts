import { DatabaseSync } from 'node:sqlite';
import { DatabaseError } from '../errors/base.js';

export interface RuntimeJobRecord {
  id: string;
  task_id: string | null;
  automation_id: string | null;
  type: string;
  priority: number;
  payload_json: string;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  next_retry_at: string | null;
  recovery_policy: string;
}

export interface AutomationRecord {
  id: string;
  name: string;
  description: string;
  enabled: number;
  trigger_type: string;
  trigger_config_json: string;
  actions_json: string;
  timezone: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationRunRecord {
  id: string;
  automation_id: string;
  job_id: string | null;
  status: string;
  error_json: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ReminderRecord {
  id: string;
  job_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  timezone: string;
  scheduled_at: string;
  created_at: string;
  delivered_at: string | null;
}

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: string;
  metadata_json: string;
  created_at: string;
  read_at: string | null;
  delivered_at: string | null;
}

export interface VoiceSessionRecord {
  id: string;
  session_id: string | null;
  state: string;
  language: string;
  metadata_json: string;
  started_at: string;
  ended_at: string | null;
}

export interface VoiceTranscriptRecord {
  id: string;
  voice_session_id: string;
  text: string;
  is_final: number;
  confidence: number;
  provider: string;
  created_at: string;
}

export class RuntimeJobRepository {
  constructor(private db: DatabaseSync) {}

  public create(record: RuntimeJobRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO runtime_jobs (
          id, task_id, automation_id, type, priority, payload_json, status,
          attempts, max_attempts, created_at, scheduled_at, started_at,
          completed_at, last_error, next_retry_at, recovery_policy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.task_id, record.automation_id, record.type, record.priority,
        record.payload_json, record.status, record.attempts, record.max_attempts,
        record.created_at, record.scheduled_at, record.started_at, record.completed_at,
        record.last_error, record.next_retry_at, record.recovery_policy
      );
    } catch (err) {
      throw new DatabaseError(`Failed to create runtime job: ${record.id}`, undefined, err as Error);
    }
  }

  public update(record: RuntimeJobRecord): void {
    try {
      this.db.prepare(`
        UPDATE runtime_jobs SET
          task_id = ?, automation_id = ?, type = ?, priority = ?, payload_json = ?,
          status = ?, attempts = ?, max_attempts = ?, scheduled_at = ?,
          started_at = ?, completed_at = ?, last_error = ?, next_retry_at = ?, recovery_policy = ?
        WHERE id = ?
      `).run(
        record.task_id, record.automation_id, record.type, record.priority, record.payload_json,
        record.status, record.attempts, record.max_attempts, record.scheduled_at,
        record.started_at, record.completed_at, record.last_error, record.next_retry_at,
        record.recovery_policy, record.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update runtime job: ${record.id}`, undefined, err as Error);
    }
  }

  public findById(id: string): RuntimeJobRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM runtime_jobs WHERE id = ?');
      const row = stmt.get(id);
      return (row as unknown as RuntimeJobRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to find runtime job: ${id}`, undefined, err as Error);
    }
  }

  public findPendingJobs(limit: number = 100): RuntimeJobRecord[] {
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        SELECT * FROM runtime_jobs 
        WHERE (status = 'QUEUED' AND (scheduled_at IS NULL OR scheduled_at <= ?))
           OR (status = 'RETRYING' AND (next_retry_at IS NULL OR next_retry_at <= ?))
        ORDER BY priority ASC, created_at ASC
        LIMIT ?
      `);
      return stmt.all(now, now, limit) as unknown as RuntimeJobRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to find pending runtime jobs', undefined, err as Error);
    }
  }
}

export class AutomationRepository {
  constructor(private db: DatabaseSync) {}

  public create(record: AutomationRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO automations (
          id, name, description, enabled, trigger_type, trigger_config_json,
          actions_json, timezone, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.name, record.description, record.enabled, record.trigger_type,
        record.trigger_config_json, record.actions_json, record.timezone,
        record.metadata_json, record.created_at, record.updated_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to create automation: ${record.id}`, undefined, err as Error);
    }
  }

  public listEnabled(): AutomationRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM automations WHERE enabled = 1');
      return stmt.all() as unknown as AutomationRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list enabled automations', undefined, err as Error);
    }
  }

  public findById(id: string): AutomationRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM automations WHERE id = ?');
      const row = stmt.get(id);
      return (row as unknown as AutomationRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to find automation: ${id}`, undefined, err as Error);
    }
  }

  public update(record: AutomationRecord): void {
    try {
      this.db.prepare(`
        UPDATE automations SET
          name = ?, description = ?, enabled = ?, trigger_type = ?,
          trigger_config_json = ?, actions_json = ?, timezone = ?,
          metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        record.name, record.description, record.enabled, record.trigger_type,
        record.trigger_config_json, record.actions_json, record.timezone,
        record.metadata_json, record.updated_at, record.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update automation: ${record.id}`, undefined, err as Error);
    }
  }
}

export class NotificationRepository {
  constructor(private db: DatabaseSync) {}

  public create(record: NotificationRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO notifications (
          id, type, title, body, priority, metadata_json,
          created_at, read_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.type, record.title, record.body, record.priority,
        record.metadata_json, record.created_at, record.read_at, record.delivered_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to create notification: ${record.id}`, undefined, err as Error);
    }
  }
}

export class ReminderRepository {
  constructor(private db: DatabaseSync) {}

  public create(record: ReminderRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO reminders (
          id, job_id, title, description, status, priority,
          timezone, scheduled_at, created_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.job_id, record.title, record.description, record.status,
        record.priority, record.timezone, record.scheduled_at, record.created_at, record.delivered_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to create reminder: ${record.id}`, undefined, err as Error);
    }
  }
}

export class VoiceRepository {
  constructor(private db: DatabaseSync) {}

  public createSession(record: VoiceSessionRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO voice_sessions (
          id, session_id, state, language, metadata_json, started_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.session_id, record.state, record.language,
        record.metadata_json, record.started_at, record.ended_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to create voice session: ${record.id}`, undefined, err as Error);
    }
  }
}
