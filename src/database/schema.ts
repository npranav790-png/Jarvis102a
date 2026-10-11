import { DatabaseSync } from 'node:sqlite';
import { DatabaseError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('DatabaseSchema');

export function initializeSchema(db: DatabaseSync): void {
  try {
    db.exec(`
      -- Projects Table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        root_path TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Sessions Table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      -- Messages Table (Persistent multi-turn chat history)
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        task_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id, created_at);

      -- Tasks Table
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_task_id TEXT,
        session_id TEXT,
        project_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'GENERAL',
        status TEXT NOT NULL DEFAULT 'CREATED',
        priority INTEGER NOT NULL DEFAULT 5,
        input_json TEXT NOT NULL DEFAULT '{}',
        output_json TEXT,
        error_json TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      -- Events Table
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        correlation_id TEXT,
        causation_id TEXT,
        task_id TEXT,
        job_id TEXT,
        session_id TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        timestamp TEXT NOT NULL
      );

      -- Security Audit Logs Table
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        actor TEXT NOT NULL,
        target TEXT NOT NULL,
        decision TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        timestamp TEXT NOT NULL
      );

      -- Plans Table
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        objective TEXT NOT NULL,
        assumptions_json TEXT NOT NULL DEFAULT '[]',
        constraints_json TEXT NOT NULL DEFAULT '[]',
        success_criteria_json TEXT NOT NULL DEFAULT '[]',
        risks_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'PENDING',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      -- Plan Steps Table
      CREATE TABLE IF NOT EXISTS plan_steps (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'GENERAL',
        dependencies_json TEXT NOT NULL DEFAULT '[]',
        expected_output TEXT NOT NULL DEFAULT '',
        success_criteria TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
      );

      -- Persistent Memories Table
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        predicate TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        importance TEXT NOT NULL DEFAULT 'NORMAL',
        confidence REAL NOT NULL DEFAULT 1.0,
        source TEXT NOT NULL DEFAULT 'SYSTEM',
        project_id TEXT,
        session_id TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        expires_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );

      -- Memory Links Table (traceability to tasks, plans, events, sessions)
      CREATE TABLE IF NOT EXISTS memory_links (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      -- Reasoning Runs Table
      CREATE TABLE IF NOT EXISTS reasoning_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        project_id TEXT,
        task_id TEXT,
        mode TEXT NOT NULL DEFAULT 'STANDARD',
        decision_summary TEXT NOT NULL,
        rationale TEXT NOT NULL,
        evidence_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      -- Verification Records Table
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        plan_id TEXT,
        step_id TEXT,
        status TEXT NOT NULL DEFAULT 'UNVERIFIED',
        evidence_json TEXT NOT NULL DEFAULT '[]',
        reasoning TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      -- Tool Calls Table (Auditable tool executions)
      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        session_id TEXT,
        project_id TEXT,
        agent_id TEXT,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL DEFAULT '{}',
        output_json TEXT,
        error_json TEXT,
        status TEXT NOT NULL DEFAULT 'STARTED',
        risk_level TEXT NOT NULL DEFAULT 'LOW',
        execution_time_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      -- Approvals Table (Human-in-the-loop permission requests)
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        tool_call_id TEXT,
        task_id TEXT,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        actor TEXT NOT NULL,
        target TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'PENDING',
        expires_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id) ON DELETE SET NULL
      );

      -- Artifacts Table (Outputs generated by tools and agents)
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        tool_call_id TEXT,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'FILE',
        path TEXT NOT NULL,
        checksum TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id) ON DELETE SET NULL
      );

      -- MCP Servers Table
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        command TEXT NOT NULL,
        args_json TEXT NOT NULL DEFAULT '[]',
        env_json TEXT NOT NULL DEFAULT '{}',
        transport TEXT NOT NULL DEFAULT 'STDIO',
        status TEXT NOT NULL DEFAULT 'DISCONNECTED',
        trust_level TEXT NOT NULL DEFAULT 'UNTRUSTED',
        permissions_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Workspace Locks Table (Prevents conflicting concurrent mutations)
      CREATE TABLE IF NOT EXISTS workspace_locks (
        id TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      -- PROMPT 5 TABLES: Runtime Jobs, Automations, Notifications, Voice

      -- Runtime Jobs Table
      CREATE TABLE IF NOT EXISTS runtime_jobs (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        automation_id TEXT,
        type TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5,
        payload_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'QUEUED',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL,
        scheduled_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        last_error TEXT,
        next_retry_at TEXT,
        recovery_policy TEXT NOT NULL DEFAULT 'FAIL_SAFE',
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      -- Automations Table
      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        trigger_type TEXT NOT NULL,
        trigger_config_json TEXT NOT NULL DEFAULT '{}',
        actions_json TEXT NOT NULL DEFAULT '[]',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Automation Runs Table
      CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY,
        automation_id TEXT NOT NULL,
        job_id TEXT,
        status TEXT NOT NULL DEFAULT 'STARTED',
        error_json TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES runtime_jobs(id) ON DELETE SET NULL
      );

      -- Reminders Table
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'CREATED',
        priority TEXT NOT NULL DEFAULT 'NORMAL',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        scheduled_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        FOREIGN KEY (job_id) REFERENCES runtime_jobs(id) ON DELETE SET NULL
      );

      -- Notifications Table
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'NORMAL',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        read_at TEXT,
        delivered_at TEXT
      );

      -- Voice Sessions Table
      CREATE TABLE IF NOT EXISTS voice_sessions (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        state TEXT NOT NULL DEFAULT 'IDLE',
        language TEXT NOT NULL DEFAULT 'en',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        started_at TEXT NOT NULL,
        ended_at TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );

      -- Voice Transcripts Table
      CREATE TABLE IF NOT EXISTS voice_transcripts (
        id TEXT PRIMARY KEY,
        voice_session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        is_final INTEGER NOT NULL DEFAULT 1,
        confidence REAL NOT NULL DEFAULT 1.0,
        provider TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (voice_session_id) REFERENCES voice_sessions(id) ON DELETE CASCADE
      );

      -- PROMPT 6 TABLES: Devices, Pairings

      -- Devices Table
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        platform TEXT NOT NULL,
        app_version TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      );

      -- Device Pairings Table
      CREATE TABLE IF NOT EXISTS device_pairings (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        device_id TEXT,
        created_at TEXT NOT NULL
      );

      -- Helpful Indexes
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_events_job ON events(job_id);
      CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_plans_task ON plans(task_id);
      CREATE INDEX IF NOT EXISTS idx_plan_steps_plan ON plan_steps(plan_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
      CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
      CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
      CREATE INDEX IF NOT EXISTS idx_memory_links_mem ON memory_links(memory_id);
      CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links(target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_reasoning_task ON reasoning_runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_verifications_plan ON verifications(plan_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
      CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(status);
      CREATE INDEX IF NOT EXISTS idx_workspace_locks_path ON workspace_locks(workspace_path);
      
      -- Prompt 5 Indexes
      CREATE INDEX IF NOT EXISTS idx_runtime_jobs_status ON runtime_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_runtime_jobs_scheduled ON runtime_jobs(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_runtime_jobs_retry ON runtime_jobs(next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_runtime_jobs_automation ON runtime_jobs(automation_id);
      CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled);
      CREATE INDEX IF NOT EXISTS idx_automations_trigger ON automations(trigger_type);
      CREATE INDEX IF NOT EXISTS idx_automation_runs_auto ON automation_runs(automation_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
      CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at);
      CREATE INDEX IF NOT EXISTS idx_voice_transcripts_session ON voice_transcripts(voice_session_id);

      -- Prompt 6 Indexes
      CREATE INDEX IF NOT EXISTS idx_devices_revoked ON devices(revoked_at);
      CREATE INDEX IF NOT EXISTS idx_device_pairings_used ON device_pairings(used_at);
    `);

    logger.debug('Database schema initialized successfully.');
  } catch (err) {
    throw new DatabaseError('Failed to initialize database schema', undefined, err as Error);
  }
}

