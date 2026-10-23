import { DatabaseSync } from 'node:sqlite';
import { DatabaseError } from '../errors/base.js';

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  root_path: string;
  metadata_json: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  id: string;
  project_id: string | null;
  title: string;
  metadata_json: string;
  status: string;
  created_at: string;
  last_active_at: string;
}

export interface MessageRecord {
  id: string;
  session_id: string | null;
  role: string;
  content: string;
  task_id: string | null;
  metadata_json: string;
  created_at: string;
}

export interface TaskRecord {
  id: string;
  parent_task_id: string | null;
  session_id: string | null;
  project_id: string | null;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: number;
  input_json: string;
  output_json: string | null;
  error_json: string | null;
  retry_count: number;
  max_retries: number;
  metadata_json: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface EventRecord {
  id: string;
  event_type: string;
  source: string;
  correlation_id: string | null;
  payload_json: string;
  timestamp: string;
}

export interface AuditRecord {
  id: string;
  action: string;
  risk_level: string;
  actor: string;
  target: string;
  decision: string;
  metadata_json: string;
  timestamp: string;
}

export interface PlanRecord {
  id: string;
  task_id: string | null;
  objective: string;
  assumptions_json: string;
  constraints_json: string;
  success_criteria_json: string;
  risks_json: string;
  status: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface PlanStepRecord {
  id: string;
  plan_id: string;
  step_index: number;
  title: string;
  description: string;
  type: string;
  dependencies_json: string;
  expected_output: string;
  success_criteria: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryRecord {
  id: string;
  type: string;
  subject: string;
  predicate: string;
  content: string;
  summary: string;
  importance: string;
  confidence: number;
  source: string;
  project_id: string | null;
  session_id: string | null;
  status: string;
  expires_at: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryLinkRecord {
  id: string;
  memory_id: string;
  target_type: string;
  target_id: string;
  created_at: string;
}

export interface ReasoningRecord {
  id: string;
  session_id: string | null;
  project_id: string | null;
  task_id: string | null;
  mode: string;
  decision_summary: string;
  rationale: string;
  evidence_json: string;
  created_at: string;
}

export interface VerificationRecord {
  id: string;
  plan_id: string | null;
  step_id: string | null;
  status: string;
  evidence_json: string;
  reasoning: string;
  created_at: string;
}

export interface ToolCallRecord {
  id: string;
  task_id: string | null;
  session_id: string | null;
  project_id: string | null;
  agent_id: string | null;
  tool_name: string;
  input_json: string;
  output_json: string | null;
  error_json: string | null;
  status: string;
  risk_level: string;
  execution_time_ms: number;
  created_at: string;
  completed_at: string | null;
}

export interface ApprovalDbRecord {
  id: string;
  tool_call_id: string | null;
  task_id: string | null;
  action: string;
  category: string;
  risk_level: string;
  actor: string;
  target: string;
  reason: string;
  metadata_json: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';
  expires_at: string;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
}

export interface ArtifactRecord {
  id: string;
  task_id: string | null;
  tool_call_id: string | null;
  name: string;
  type: string;
  path: string;
  checksum: string | null;
  size_bytes: number;
  metadata_json: string;
  created_at: string;
}

export interface MCPServerRecord {
  id: string;
  name: string;
  description: string;
  command: string;
  args_json: string;
  env_json: string;
  transport: string;
  status: string;
  trust_level: string;
  permissions_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceLockRecord {
  id: string;
  workspace_path: string;
  task_id: string;
  agent_id: string;
  acquired_at: string;
  expires_at: string;
}


export class ProjectRepository {
  constructor(private db: DatabaseSync) {}

  public insert(project: ProjectRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO projects (id, name, description, root_path, metadata_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        project.id,
        project.name,
        project.description,
        project.root_path,
        project.metadata_json,
        project.status,
        project.created_at,
        project.updated_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert project: ${project.id}`, undefined, err as Error);
    }
  }

  public getById(id: string): ProjectRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
      const row = stmt.get(id) as ProjectRecord | undefined;
      return row || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get project: ${id}`, undefined, err as Error);
    }
  }

  public list(): ProjectRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
      return stmt.all() as unknown as ProjectRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list projects', undefined, err as Error);
    }
  }

  public update(project: Partial<ProjectRecord> & { id: string }): void {
    try {
      const existing = this.getById(project.id);
      if (!existing) {
        throw new DatabaseError(`Project not found for update: ${project.id}`);
      }

      const updated: ProjectRecord = {
        ...existing,
        ...project,
        updated_at: new Date().toISOString(),
      };

      this.db.prepare(`
        UPDATE projects
        SET name = ?, description = ?, root_path = ?, metadata_json = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        updated.name,
        updated.description,
        updated.root_path,
        updated.metadata_json,
        updated.status,
        updated.updated_at,
        updated.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update project: ${project.id}`, undefined, err as Error);
    }
  }
}

export class SessionRepository {
  constructor(private db: DatabaseSync) {}

  public insert(session: SessionRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO sessions (id, project_id, title, metadata_json, status, created_at, last_active_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.project_id,
        session.title,
        session.metadata_json,
        session.status,
        session.created_at,
        session.last_active_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert session: ${session.id}`, undefined, err as Error);
    }
  }

  public getById(id: string): SessionRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
      const row = stmt.get(id) as SessionRecord | undefined;
      return row || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get session: ${id}`, undefined, err as Error);
    }
  }

  public list(projectId?: string): SessionRecord[] {
    try {
      if (projectId) {
        const stmt = this.db.prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY last_active_at DESC');
        return stmt.all(projectId) as unknown as SessionRecord[];
      }
      const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY last_active_at DESC');
      return stmt.all() as unknown as SessionRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list sessions', undefined, err as Error);
    }
  }

  public updateLastActive(id: string, timestamp: string = new Date().toISOString()): void {
    try {
      this.db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(timestamp, id);
    } catch (err) {
      throw new DatabaseError(`Failed to update session activity: ${id}`, undefined, err as Error);
    }
  }

  public updateStatus(id: string, status: string): void {
    try {
      this.db.prepare('UPDATE sessions SET status = ?, last_active_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
    } catch (err) {
      throw new DatabaseError(`Failed to update session status: ${id}`, undefined, err as Error);
    }
  }

  public delete(id: string): void {
    try {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    } catch (err) {
      throw new DatabaseError(`Failed to delete session: ${id}`, undefined, err as Error);
    }
  }
}


export class MessageRepository {
  constructor(private db: DatabaseSync) {}

  public insert(msg: MessageRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO messages (id, session_id, role, content, task_id, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.id,
        msg.session_id,
        msg.role,
        msg.content,
        msg.task_id,
        msg.metadata_json,
        msg.created_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert message: ${msg.id}`, undefined, err as Error);
    }
  }

  public listBySession(sessionId: string, limit: number = 50): MessageRecord[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM messages
        WHERE session_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      `);
      return stmt.all(sessionId, limit) as unknown as MessageRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to list messages for session: ${sessionId}`, undefined, err as Error);
    }
  }

  public listRecentBySession(sessionId: string, limit: number = 20): MessageRecord[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM messages
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      const rows = stmt.all(sessionId, limit) as unknown as MessageRecord[];
      return rows.reverse();
    } catch (err) {
      throw new DatabaseError(`Failed to list recent messages for session: ${sessionId}`, undefined, err as Error);
    }
  }

  public getRecent(limit: number = 30): MessageRecord[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM messages
        ORDER BY created_at DESC
        LIMIT ?
      `);
      const rows = stmt.all(limit) as unknown as MessageRecord[];
      return rows.reverse();
    } catch (err) {
      throw new DatabaseError('Failed to list recent messages', undefined, err as Error);
    }
  }

  public deleteBySession(sessionId: string): void {
    try {
      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
    } catch (err) {
      throw new DatabaseError(`Failed to delete messages for session: ${sessionId}`, undefined, err as Error);
    }
  }
}

export class TaskRepository {
  constructor(private db: DatabaseSync) {}

  public insert(task: TaskRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO tasks (
          id, parent_task_id, session_id, project_id, title, description,
          type, status, priority, input_json, output_json, error_json,
          retry_count, max_retries, metadata_json, created_at, started_at,
          completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.id,
        task.parent_task_id,
        task.session_id,
        task.project_id,
        task.title,
        task.description,
        task.type,
        task.status,
        task.priority,
        task.input_json,
        task.output_json,
        task.error_json,
        task.retry_count,
        task.max_retries,
        task.metadata_json,
        task.created_at,
        task.started_at,
        task.completed_at,
        task.updated_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert task: ${task.id}`, undefined, err as Error);
    }
  }

  public getById(id: string): TaskRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
      const row = stmt.get(id) as TaskRecord | undefined;
      return row || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get task: ${id}`, undefined, err as Error);
    }
  }

  public list(filters: { projectId?: string; sessionId?: string; status?: string } = {}): TaskRecord[] {
    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (filters.projectId) {
        conditions.push('project_id = ?');
        params.push(filters.projectId);
      }
      if (filters.sessionId) {
        conditions.push('session_id = ?');
        params.push(filters.sessionId);
      }
      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const stmt = this.db.prepare(`SELECT * FROM tasks ${whereClause} ORDER BY priority DESC, created_at ASC`);
      return stmt.all(...params) as unknown as TaskRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list tasks', undefined, err as Error);
    }
  }

  public update(task: Partial<TaskRecord> & { id: string }): void {
    try {
      const existing = this.getById(task.id);
      if (!existing) {
        throw new DatabaseError(`Task not found for update: ${task.id}`);
      }

      const updated: TaskRecord = {
        ...existing,
        ...task,
        updated_at: new Date().toISOString(),
      };

      this.db.prepare(`
        UPDATE tasks SET
          parent_task_id = ?,
          session_id = ?,
          project_id = ?,
          title = ?,
          description = ?,
          type = ?,
          status = ?,
          priority = ?,
          input_json = ?,
          output_json = ?,
          error_json = ?,
          retry_count = ?,
          max_retries = ?,
          metadata_json = ?,
          started_at = ?,
          completed_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        updated.parent_task_id,
        updated.session_id,
        updated.project_id,
        updated.title,
        updated.description,
        updated.type,
        updated.status,
        updated.priority,
        updated.input_json,
        updated.output_json,
        updated.error_json,
        updated.retry_count,
        updated.max_retries,
        updated.metadata_json,
        updated.started_at,
        updated.completed_at,
        updated.updated_at,
        updated.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update task: ${task.id}`, undefined, err as Error);
    }
  }
}

export class EventRepository {
  constructor(private db: DatabaseSync) {}

  public insert(event: EventRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO events (id, event_type, source, correlation_id, payload_json, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        event.id,
        event.event_type,
        event.source,
        event.correlation_id,
        event.payload_json,
        event.timestamp
      );
    } catch (err) {
      throw new DatabaseError(`Failed to record event: ${event.id}`, undefined, err as Error);
    }
  }

  public list(limit: number = 100): EventRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ?');
      return stmt.all(limit) as unknown as EventRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list events', undefined, err as Error);
    }
  }
}

export class AuditRepository {
  constructor(private db: DatabaseSync) {}

  public insert(audit: AuditRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO audit_logs (id, action, risk_level, actor, target, decision, metadata_json, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        audit.id,
        audit.action,
        audit.risk_level,
        audit.actor,
        audit.target,
        audit.decision,
        audit.metadata_json,
        audit.timestamp
      );
    } catch (err) {
      throw new DatabaseError(`Failed to record audit log: ${audit.id}`, undefined, err as Error);
    }
  }

  public list(limit: number = 100): AuditRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?');
      return stmt.all(limit) as unknown as AuditRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list audit logs', undefined, err as Error);
    }
  }
}

export class PlanRepository {
  constructor(private db: DatabaseSync) {}

  public insert(plan: PlanRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO plans (id, task_id, objective, assumptions_json, constraints_json, success_criteria_json, risks_json, status, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        plan.id,
        plan.task_id,
        plan.objective,
        plan.assumptions_json,
        plan.constraints_json,
        plan.success_criteria_json,
        plan.risks_json,
        plan.status,
        plan.metadata_json,
        plan.created_at,
        plan.updated_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert plan: ${plan.id}`, undefined, err as Error);
    }
  }

  public update(plan: PlanRecord): void {
    try {
      this.db.prepare(`
        UPDATE plans SET
          task_id = ?,
          objective = ?,
          assumptions_json = ?,
          constraints_json = ?,
          success_criteria_json = ?,
          risks_json = ?,
          status = ?,
          metadata_json = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        plan.task_id,
        plan.objective,
        plan.assumptions_json,
        plan.constraints_json,
        plan.success_criteria_json,
        plan.risks_json,
        plan.status,
        plan.metadata_json,
        plan.updated_at,
        plan.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update plan: ${plan.id}`, undefined, err as Error);
    }
  }

  public findById(id: string): PlanRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM plans WHERE id = ?');
      const row = stmt.get(id);
      return (row as unknown as PlanRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get plan: ${id}`, undefined, err as Error);
    }
  }

  public findByTaskId(taskId: string): PlanRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM plans WHERE task_id = ? ORDER BY created_at DESC LIMIT 1');
      const row = stmt.get(taskId);
      return (row as unknown as PlanRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get plan for task: ${taskId}`, undefined, err as Error);
    }
  }

  public list(limit: number = 50): PlanRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM plans ORDER BY created_at DESC LIMIT ?');
      return stmt.all(limit) as unknown as PlanRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list plans', undefined, err as Error);
    }
  }

  public insertStep(step: PlanStepRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO plan_steps (id, plan_id, step_index, title, description, type, dependencies_json, expected_output, success_criteria, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        step.id,
        step.plan_id,
        step.step_index,
        step.title,
        step.description,
        step.type,
        step.dependencies_json,
        step.expected_output,
        step.success_criteria,
        step.status,
        step.created_at,
        step.updated_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert plan step: ${step.id}`, undefined, err as Error);
    }
  }

  public updateStep(step: PlanStepRecord): void {
    try {
      this.db.prepare(`
        UPDATE plan_steps SET
          plan_id = ?,
          step_index = ?,
          title = ?,
          description = ?,
          type = ?,
          dependencies_json = ?,
          expected_output = ?,
          success_criteria = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        step.plan_id,
        step.step_index,
        step.title,
        step.description,
        step.type,
        step.dependencies_json,
        step.expected_output,
        step.success_criteria,
        step.status,
        step.updated_at,
        step.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update plan step: ${step.id}`, undefined, err as Error);
    }
  }

  public findStepById(id: string): PlanStepRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM plan_steps WHERE id = ?');
      const row = stmt.get(id);
      return (row as unknown as PlanStepRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to find plan step: ${id}`, undefined, err as Error);
    }
  }

  public listSteps(planId: string): PlanStepRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM plan_steps WHERE plan_id = ? ORDER BY step_index ASC');
      return stmt.all(planId) as unknown as PlanStepRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to list plan steps for: ${planId}`, undefined, err as Error);
    }
  }

  public delete(id: string): void {
    try {
      this.db.prepare('DELETE FROM plan_steps WHERE plan_id = ?').run(id);
      this.db.prepare('DELETE FROM plans WHERE id = ?').run(id);
    } catch (err) {
      throw new DatabaseError(`Failed to delete plan: ${id}`, undefined, err as Error);
    }
  }
}

export class MemoryRepository {
  constructor(private db: DatabaseSync) {}

  public insert(memory: MemoryRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO memories (id, type, subject, predicate, content, summary, importance, confidence, source, project_id, session_id, status, expires_at, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        memory.id,
        memory.type,
        memory.subject,
        memory.predicate,
        memory.content,
        memory.summary,
        memory.importance,
        memory.confidence,
        memory.source,
        memory.project_id,
        memory.session_id,
        memory.status,
        memory.expires_at,
        memory.metadata_json,
        memory.created_at,
        memory.updated_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert memory: ${memory.id}`, undefined, err as Error);
    }
  }

  public update(memory: MemoryRecord): void {
    try {
      this.db.prepare(`
        UPDATE memories SET
          type = ?,
          subject = ?,
          predicate = ?,
          content = ?,
          summary = ?,
          importance = ?,
          confidence = ?,
          source = ?,
          project_id = ?,
          session_id = ?,
          status = ?,
          expires_at = ?,
          metadata_json = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        memory.type,
        memory.subject,
        memory.predicate,
        memory.content,
        memory.summary,
        memory.importance,
        memory.confidence,
        memory.source,
        memory.project_id,
        memory.session_id,
        memory.status,
        memory.expires_at,
        memory.metadata_json,
        memory.updated_at,
        memory.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update memory: ${memory.id}`, undefined, err as Error);
    }
  }

  public findById(id: string): MemoryRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
      const row = stmt.get(id);
      return (row as unknown as MemoryRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get memory: ${id}`, undefined, err as Error);
    }
  }

  public list(filters?: { projectId?: string | null; sessionId?: string; type?: string; status?: string; limit?: number }): MemoryRecord[] {
    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (filters?.projectId !== undefined) {
        if (filters.projectId === null) {
          conditions.push('project_id IS NULL');
        } else {
          conditions.push('project_id = ?');
          params.push(filters.projectId);
        }
      }

      if (filters?.sessionId) {
        conditions.push('session_id = ?');
        params.push(filters.sessionId);
      }

      if (filters?.type) {
        conditions.push('type = ?');
        params.push(filters.type);
      }

      if (filters?.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      } else {
        conditions.push("status != 'EXPIRED' AND status != 'ARCHIVED'");
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters?.limit ?? 100;
      params.push(limit);

      const stmt = this.db.prepare(`SELECT * FROM memories ${whereClause} ORDER BY created_at DESC LIMIT ?`);
      return stmt.all(...params) as unknown as MemoryRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list memories', undefined, err as Error);
    }
  }

  public search(query: string, filters?: { projectId?: string | null; type?: string; limit?: number }): MemoryRecord[] {
    try {
      const conditions: string[] = ["status != 'EXPIRED' AND status != 'ARCHIVED'"];
      const params: any[] = [];

      const cleanQuery = query.trim();
      const tokens = cleanQuery.toLowerCase().split(/\s+/).filter(t => t.length > 1);

      if (tokens.length <= 1) {
        conditions.push('(content LIKE ? OR summary LIKE ? OR subject LIKE ?)');
        const wild = `%${cleanQuery}%`;
        params.push(wild, wild, wild);
      } else {
        // Multi-term hybrid keyword match: match records containing any search token
        const tokenClauses = tokens.map(() => '(content LIKE ? OR summary LIKE ? OR subject LIKE ?)');
        conditions.push(`(${tokenClauses.join(' OR ')})`);
        for (const token of tokens) {
          const wild = `%${token}%`;
          params.push(wild, wild, wild);
        }
      }

      if (filters?.projectId !== undefined) {
        if (filters.projectId === null) {
          conditions.push('project_id IS NULL');
        } else {
          conditions.push('project_id = ?');
          params.push(filters.projectId);
        }
      }

      if (filters?.type) {
        conditions.push('type = ?');
        params.push(filters.type);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const limit = filters?.limit ?? 50;
      params.push(limit);

      const stmt = this.db.prepare(`SELECT * FROM memories ${whereClause} ORDER BY created_at DESC LIMIT ?`);
      return stmt.all(...params) as unknown as MemoryRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to search memories: ${query}`, undefined, err as Error);
    }
  }


  public delete(id: string): void {
    try {
      this.db.prepare('DELETE FROM memory_links WHERE memory_id = ?').run(id);
      this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    } catch (err) {
      throw new DatabaseError(`Failed to delete memory: ${id}`, undefined, err as Error);
    }
  }

  public insertLink(link: MemoryLinkRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO memory_links (id, memory_id, target_type, target_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(link.id, link.memory_id, link.target_type, link.target_id, link.created_at);
    } catch (err) {
      throw new DatabaseError(`Failed to insert memory link: ${link.id}`, undefined, err as Error);
    }
  }

  public listLinks(memoryId: string): MemoryLinkRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM memory_links WHERE memory_id = ?');
      return stmt.all(memoryId) as unknown as MemoryLinkRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to list memory links: ${memoryId}`, undefined, err as Error);
    }
  }

  public expireOlderThan(isoTimestamp: string): number {
    try {
      const res = this.db.prepare(`
        UPDATE memories SET status = 'EXPIRED'
        WHERE expires_at IS NOT NULL AND expires_at < ? AND status = 'ACTIVE'
      `).run(isoTimestamp);
      return Number(res.changes);
    } catch (err) {
      throw new DatabaseError('Failed to expire memories', undefined, err as Error);
    }
  }
}

export class ReasoningRepository {
  constructor(private db: DatabaseSync) {}

  public insert(record: ReasoningRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO reasoning_runs (id, session_id, project_id, task_id, mode, decision_summary, rationale, evidence_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.session_id,
        record.project_id,
        record.task_id,
        record.mode,
        record.decision_summary,
        record.rationale,
        record.evidence_json,
        record.created_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert reasoning record: ${record.id}`, undefined, err as Error);
    }
  }

  public listByTaskId(taskId: string): ReasoningRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM reasoning_runs WHERE task_id = ? ORDER BY created_at ASC');
      return stmt.all(taskId) as unknown as ReasoningRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to list reasoning runs for task: ${taskId}`, undefined, err as Error);
    }
  }

  public list(limit: number = 50): ReasoningRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM reasoning_runs ORDER BY created_at DESC LIMIT ?');
      return stmt.all(limit) as unknown as ReasoningRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list reasoning runs', undefined, err as Error);
    }
  }
}

export class VerificationRepository {
  constructor(private db: DatabaseSync) {}

  public insert(record: VerificationRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO verifications (id, plan_id, step_id, status, evidence_json, reasoning, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.plan_id || null,
        record.step_id,
        record.status,
        record.evidence_json,
        record.reasoning,
        record.created_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert verification record: ${record.id}`, undefined, err as Error);
    }
  }

  public listByPlanId(planId: string): VerificationRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM verifications WHERE plan_id = ? ORDER BY created_at ASC');
      return stmt.all(planId) as unknown as VerificationRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to list verifications for plan: ${planId}`, undefined, err as Error);
    }
  }
}

export class ToolCallRepository {
  constructor(private db: DatabaseSync) {}

  public insert(record: ToolCallRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO tool_calls (id, task_id, session_id, project_id, agent_id, tool_name, input_json, output_json, error_json, status, risk_level, execution_time_ms, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.task_id,
        record.session_id,
        record.project_id,
        record.agent_id,
        record.tool_name,
        record.input_json,
        record.output_json,
        record.error_json,
        record.status,
        record.risk_level,
        record.execution_time_ms,
        record.created_at,
        record.completed_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert tool call: ${record.id}`, undefined, err as Error);
    }
  }

  public update(record: ToolCallRecord): void {
    try {
      this.db.prepare(`
        UPDATE tool_calls SET
          output_json = ?,
          error_json = ?,
          status = ?,
          execution_time_ms = ?,
          completed_at = ?
        WHERE id = ?
      `).run(
        record.output_json,
        record.error_json,
        record.status,
        record.execution_time_ms,
        record.completed_at,
        record.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update tool call: ${record.id}`, undefined, err as Error);
    }
  }

  public findById(id: string): ToolCallRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM tool_calls WHERE id = ?');
      const row = stmt.get(id);
      return (row as unknown as ToolCallRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get tool call: ${id}`, undefined, err as Error);
    }
  }

  public listByTaskId(taskId: string): ToolCallRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM tool_calls WHERE task_id = ? ORDER BY created_at ASC');
      return stmt.all(taskId) as unknown as ToolCallRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to list tool calls for task: ${taskId}`, undefined, err as Error);
    }
  }

  public list(limit: number = 50): ToolCallRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM tool_calls ORDER BY created_at DESC LIMIT ?');
      return stmt.all(limit) as unknown as ToolCallRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list tool calls', undefined, err as Error);
    }
  }
}

export class ApprovalRepository {
  constructor(private db: DatabaseSync) {}

  public insert(record: ApprovalDbRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO approvals (id, tool_call_id, task_id, action, category, risk_level, actor, target, reason, metadata_json, status, expires_at, decided_at, decided_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.tool_call_id,
        record.task_id,
        record.action,
        record.category,
        record.risk_level,
        record.actor,
        record.target,
        record.reason,
        record.metadata_json,
        record.status,
        record.expires_at,
        record.decided_at,
        record.decided_by,
        record.created_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert approval: ${record.id}: ${(err as Error).message}`, undefined, err as Error);
    }
  }

  public update(record: ApprovalDbRecord): void {
    try {
      this.db.prepare(`
        UPDATE approvals SET
          status = ?,
          decided_at = ?,
          decided_by = ?
        WHERE id = ?
      `).run(record.status, record.decided_at, record.decided_by, record.id);
    } catch (err) {
      throw new DatabaseError(`Failed to update approval: ${record.id}`, undefined, err as Error);
    }
  }

  public findById(id: string): ApprovalDbRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM approvals WHERE id = ?');
      const row = stmt.get(id);
      return (row as unknown as ApprovalDbRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get approval: ${id}`, undefined, err as Error);
    }
  }

  public listPending(): ApprovalDbRecord[] {
    try {
      const stmt = this.db.prepare("SELECT * FROM approvals WHERE status = 'PENDING' ORDER BY created_at ASC");
      return stmt.all() as unknown as ApprovalDbRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list pending approvals', undefined, err as Error);
    }
  }

  public listByTaskId(taskId: string): ApprovalDbRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM approvals WHERE task_id = ? ORDER BY created_at ASC');
      return stmt.all(taskId) as unknown as ApprovalDbRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to list approvals for task: ${taskId}`, undefined, err as Error);
    }
  }

  public expireOlderThan(isoTimestamp: string): number {
    try {
      const res = this.db.prepare(`
        UPDATE approvals SET status = 'EXPIRED'
        WHERE expires_at < ? AND status = 'PENDING'
      `).run(isoTimestamp);
      return Number(res.changes);
    } catch (err) {
      throw new DatabaseError('Failed to expire approvals', undefined, err as Error);
    }
  }
}

export class ArtifactRepository {
  constructor(private db: DatabaseSync) {}

  public insert(record: ArtifactRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO artifacts (id, task_id, tool_call_id, name, type, path, checksum, size_bytes, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.task_id,
        record.tool_call_id,
        record.name,
        record.type,
        record.path,
        record.checksum,
        record.size_bytes,
        record.metadata_json,
        record.created_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert artifact: ${record.id}`, undefined, err as Error);
    }
  }

  public listByTaskId(taskId: string): ArtifactRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC');
      return stmt.all(taskId) as unknown as ArtifactRecord[];
    } catch (err) {
      throw new DatabaseError(`Failed to list artifacts for task: ${taskId}`, undefined, err as Error);
    }
  }

  public list(limit: number = 50): ArtifactRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM artifacts ORDER BY created_at DESC LIMIT ?');
      return stmt.all(limit) as unknown as ArtifactRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list artifacts', undefined, err as Error);
    }
  }
}

export class MCPRepository {
  constructor(private db: DatabaseSync) {}

  public insert(record: MCPServerRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO mcp_servers (id, name, description, command, args_json, env_json, transport, status, trust_level, permissions_json, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.name,
        record.description,
        record.command,
        record.args_json,
        record.env_json,
        record.transport,
        record.status,
        record.trust_level,
        record.permissions_json,
        record.metadata_json,
        record.created_at,
        record.updated_at
      );
    } catch (err) {
      throw new DatabaseError(`Failed to insert MCP server: ${record.name}`, undefined, err as Error);
    }
  }

  public update(record: MCPServerRecord): void {
    try {
      this.db.prepare(`
        UPDATE mcp_servers SET
          description = ?,
          command = ?,
          args_json = ?,
          env_json = ?,
          transport = ?,
          status = ?,
          trust_level = ?,
          permissions_json = ?,
          metadata_json = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        record.description,
        record.command,
        record.args_json,
        record.env_json,
        record.transport,
        record.status,
        record.trust_level,
        record.permissions_json,
        record.metadata_json,
        record.updated_at,
        record.id
      );
    } catch (err) {
      throw new DatabaseError(`Failed to update MCP server: ${record.id}`, undefined, err as Error);
    }
  }

  public findById(id: string): MCPServerRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?');
      const row = stmt.get(id);
      return (row as unknown as MCPServerRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get MCP server: ${id}`, undefined, err as Error);
    }
  }

  public findByName(name: string): MCPServerRecord | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM mcp_servers WHERE name = ?');
      const row = stmt.get(name);
      return (row as unknown as MCPServerRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to get MCP server by name: ${name}`, undefined, err as Error);
    }
  }

  public list(): MCPServerRecord[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM mcp_servers ORDER BY name ASC');
      return stmt.all() as unknown as MCPServerRecord[];
    } catch (err) {
      throw new DatabaseError('Failed to list MCP servers', undefined, err as Error);
    }
  }

  public delete(id: string): void {
    try {
      this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
    } catch (err) {
      throw new DatabaseError(`Failed to delete MCP server: ${id}`, undefined, err as Error);
    }
  }
}

export class WorkspaceLockRepository {
  constructor(private db: DatabaseSync) {}

  public acquire(record: WorkspaceLockRecord): boolean {
    try {
      // Remove expired locks first
      const now = new Date().toISOString();
      this.db.prepare('DELETE FROM workspace_locks WHERE expires_at < ?').run(now);

      this.db.prepare(`
        INSERT INTO workspace_locks (id, workspace_path, task_id, agent_id, acquired_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.workspace_path,
        record.task_id,
        record.agent_id,
        record.acquired_at,
        record.expires_at
      );
      return true;
    } catch {
      return false; // Lock collision
    }
  }

  public release(workspacePath: string, taskId: string): void {
    try {
      this.db.prepare('DELETE FROM workspace_locks WHERE workspace_path = ? AND task_id = ?').run(workspacePath, taskId);
    } catch (err) {
      throw new DatabaseError(`Failed to release workspace lock: ${workspacePath}`, undefined, err as Error);
    }
  }

  public findActiveLock(workspacePath: string): WorkspaceLockRecord | null {
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare('SELECT * FROM workspace_locks WHERE workspace_path = ? AND expires_at > ?');
      const row = stmt.get(workspacePath, now);
      return (row as unknown as WorkspaceLockRecord) || null;
    } catch (err) {
      throw new DatabaseError(`Failed to check workspace lock: ${workspacePath}`, undefined, err as Error);
    }
  }
}


