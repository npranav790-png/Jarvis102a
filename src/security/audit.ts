import crypto from 'node:crypto';
import { AuditRepository } from '../database/repository.js';
import { ApprovalDecision, RiskLevel } from './types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('AuditLogger');

export interface AuditEntry {
  action: string;
  riskLevel: RiskLevel;
  actor: string;
  target: string;
  decision: ApprovalDecision;
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  constructor(private auditRepo: AuditRepository) {}

  public log(entry: AuditEntry): void {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    try {
      this.auditRepo.insert({
        id,
        action: entry.action,
        risk_level: entry.riskLevel,
        actor: entry.actor,
        target: entry.target,
        decision: entry.decision,
        metadata_json: JSON.stringify(entry.metadata || {}),
        timestamp,
      });

      logger.info(
        `[AUDIT] decision=${entry.decision} action="${entry.action}" actor="${entry.actor}" target="${entry.target}" risk=${entry.riskLevel}`,
        { auditId: id, ...entry.metadata }
      );
    } catch (err) {
      logger.error('Failed to write to audit log', undefined, err as Error);
    }
  }

  public getRecentLogs(limit: number = 50) {
    return this.auditRepo.list(limit);
  }
}
