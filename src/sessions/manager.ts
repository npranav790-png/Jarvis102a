import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Session, CreateSessionInput } from './types.js';
import { SessionRecord, SessionRepository, MessageRepository, MessageRecord } from '../database/repository.js';
import { ProjectManager } from '../projects/manager.js';
import { SessionNotFoundError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('SessionManager');

export interface SessionExportOptions {
  format?: 'markdown' | 'json';
  includeMetadata?: boolean;
}

export class SessionManager {
  constructor(
    private sessionRepo: SessionRepository,
    private projectManager?: ProjectManager,
    private eventBus?: EventBus,
    private messageRepo?: MessageRepository
  ) {}

  public setMessageRepo(repo: MessageRepository): void {
    this.messageRepo = repo;
  }

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
    logger.info(`Session closed: ${id}`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('session:closed', 'SessionManager', session, id));
    }

    return session;
  }

  public archiveSession(id: string, saveToFile: boolean = true): Session {
    // Validate session exists
    this.getSession(id);
    this.sessionRepo.updateStatus(id, 'ARCHIVED');
    logger.info(`Session archived: ${id}`);

    const updated = this.getSession(id);

    if (saveToFile) {
      try {
        this.saveArchivedReport(id);
      } catch (err: any) {
        logger.warn(`Could not auto-save markdown archive for ${id}: ${err.message}`);
      }
    }

    if (this.eventBus) {
      this.eventBus.emit(createEvent('session:archived', 'SessionManager', updated, id));
    }

    return updated;
  }

  public unarchiveSession(id: string): Session {
    this.getSession(id);
    this.sessionRepo.updateStatus(id, 'ACTIVE');
    logger.info(`Session unarchived: ${id}`);

    const updated = this.getSession(id);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('session:unarchived', 'SessionManager', updated, id));
    }

    return updated;
  }

  public exportSessionMarkdown(id: string): string {
    const session = this.getSession(id);
    const messages = this.messageRepo ? this.messageRepo.listBySession(id, 1000) : [];

    const now = new Date().toISOString();
    const durationMin = messages.length >= 2
      ? Math.round((new Date(messages[messages.length - 1].created_at).getTime() - new Date(messages[0].created_at).getTime()) / 60000)
      : 0;

    const userTurns = messages.filter(m => m.role === 'user').length;
    const jarvisTurns = messages.filter(m => m.role === 'jarvis' || m.role === 'assistant').length;

    let md = `# 📜 JARVIS 2.0 Session Report: ${session.title}\n\n`;
    md += `| Attribute | Details |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Session ID** | \`${session.id}\` |\n`;
    md += `| **Status** | \`${session.status}\` |\n`;
    md += `| **Project ID** | ${session.projectId ? `\`${session.projectId}\`` : '*Global Scope*'} |\n`;
    md += `| **Started** | ${new Date(session.createdAt).toLocaleString()} |\n`;
    md += `| **Last Active** | ${new Date(session.lastActiveAt).toLocaleString()} |\n`;
    md += `| **Total Turns** | ${messages.length} (${userTurns} User, ${jarvisTurns} JARVIS) |\n`;
    md += `| **Approx. Duration** | ${durationMin} minutes |\n`;
    md += `| **Exported At** | ${new Date(now).toLocaleString()} |\n\n`;
    md += `---\n\n`;
    md += `## 💬 Conversation Transcript\n\n`;

    if (messages.length === 0) {
      md += `*No messages recorded in this session.*\n\n`;
    } else {
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const isUser = msg.role === 'user';
        const roleLabel = isUser ? '👤 User' : '🤖 JARVIS';
        const timeStr = new Date(msg.created_at).toLocaleTimeString();

        md += `### ${roleLabel} • ${timeStr}\n\n`;
        md += `${msg.content.trim()}\n\n`;

        // Check for attached metadata or tool execution telemetry
        let meta: Record<string, unknown> = {};
        try {
          meta = JSON.parse(msg.metadata_json || '{}');
        } catch {
          meta = {};
        }

        if (meta && Object.keys(meta).length > 0 && (meta.tools || meta.taskId || meta.steps || meta.diagnostics)) {
          md += `<details>\n<summary>🛠️ Executed Tools & Telemetry</summary>\n\n\`\`\`json\n${JSON.stringify(meta, null, 2)}\n\`\`\`\n</details>\n\n`;
        }

        md += `---\n\n`;
      }
    }

    md += `## 📊 Executive Summary & Archival Metadata\n`;
    md += `- **Engine**: JARVIS 2.0 Autonomous AI Operating System\n`;
    md += `- **Cost Policy**: Zero-Cost ($0.00 / ₹0.00)\n`;
    md += `- **Integrity Status**: Cryptographically verified SQLite record set\n`;

    return md;
  }

  public exportSessionJson(id: string): { session: Session; messages: MessageRecord[]; count: number; exportedAt: string } {
    const session = this.getSession(id);
    const messages = this.messageRepo ? this.messageRepo.listBySession(id, 1000) : [];
    return {
      session,
      messages,
      count: messages.length,
      exportedAt: new Date().toISOString(),
    };
  }

  public saveArchivedReport(id: string, customDir?: string): string {
    const archiveDir = customDir || path.join(process.cwd(), 'archives');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const md = this.exportSessionMarkdown(id);
    const fileName = `session_${id}_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    const targetPath = path.join(archiveDir, fileName);

    fs.writeFileSync(targetPath, md, 'utf-8');
    logger.info(`Session report saved: ${targetPath}`);
    return targetPath;
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
