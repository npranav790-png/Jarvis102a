import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';

export class ApprovalsController {
  constructor(private runtime: JarvisRuntime) {}

  public list = (req: Request, res: Response, next: NextFunction) => {
    try {
      const pending = this.runtime.engine.approvalManager.listPending().map((a: any) => ({
        id: a.id,
        taskId: a.task_id,
        action: a.action,
        resource: a.target,
        riskLevel: a.risk_level,
        expiresAt: a.expires_at,
        status: a.status,
        reason: a.reason
      }));
      res.json(pending);
    } catch (err) {
      next(err);
    }
  };

  public get = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const approval = this.runtime.engine.db.connect().prepare(`SELECT id, task_id as taskId, action, target as resource, risk_level as riskLevel, expires_at as expiresAt, status, reason FROM approvals WHERE id = ?`).get(id);
      if (!approval) throw new AppError('NOT_FOUND', 'Approval not found', 404);
      res.json(approval);
    } catch (err) {
      next(err);
    }
  };

  public approve = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const approved = this.runtime.engine.approvalManager.approve(id, `api:${req.deviceId || 'unknown'}`);
      res.json(approved);
    } catch (err) {
      next(err);
    }
  };

  public deny = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const reason = req.body.reason || 'Denied via API';
      const denied = this.runtime.engine.approvalManager.deny(id, `api:${req.deviceId || 'unknown'}`, reason);
      res.json(denied);
    } catch (err) {
      next(err);
    }
  };
}
