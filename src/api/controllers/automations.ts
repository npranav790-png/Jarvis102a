import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';

export class AutomationsController {
  constructor(private runtime: JarvisRuntime) {}

  public list = (req: Request, res: Response, next: NextFunction) => {
    try {
      const automations = this.runtime.automationRepo.listEnabled();
      res.json(automations);
    } catch (err) {
      next(err);
    }
  };

  public get = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const automation = this.runtime.engine.db.connect().prepare(`SELECT * FROM automations WHERE id = ?`).get(id);
      if (!automation) throw new AppError('NOT_FOUND', 'Automation not found', 404);
      res.json(automation);
    } catch (err) {
      next(err);
    }
  };

  public create = (req: Request, res: Response, next: NextFunction) => {
    try {
      const automation = this.runtime.automationRepo.create(req.body);
      res.json(automation);
    } catch (err) {
      next(err);
    }
  };

  public update = (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use SQL directly since automationRepo.update only takes full record
      const id = req.params.id as string;
      const updates = req.body;
      const db = this.runtime.engine.db.connect();
      
      const setClauses: string[] = [];
      const values: any[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (k !== 'id') {
          setClauses.push(`${k} = ?`);
          values.push(typeof v === 'object' ? JSON.stringify(v) : v);
        }
      }
      values.push(id);
      
      db.prepare(`UPDATE automations SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      const automation = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(id);
      res.json(automation);
    } catch (err) {
      next(err);
    }
  };

  public delete = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      this.runtime.engine.db.connect().prepare(`DELETE FROM automations WHERE id = ?`).run(id as string);
      res.json({ success: true, id });
    } catch (err) {
      next(err);
    }
  };

  public enable = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      this.runtime.engine.db.connect().prepare(`UPDATE automations SET enabled = 1 WHERE id = ?`).run(id as string);
      const automation = this.runtime.engine.db.connect().prepare(`SELECT * FROM automations WHERE id = ?`).get(id as string);
      res.json(automation);
    } catch (err) {
      next(err);
    }
  };

  public disable = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      this.runtime.engine.db.connect().prepare(`UPDATE automations SET enabled = 0 WHERE id = ?`).run(id as string);
      const automation = this.runtime.engine.db.connect().prepare(`SELECT * FROM automations WHERE id = ?`).get(id as string);
      res.json(automation);
    } catch (err) {
      next(err);
    }
  };

  public run = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const automation = this.runtime.engine.db.connect().prepare(`SELECT * FROM automations WHERE id = ?`).get(id) as any;
      if (!automation) throw new AppError('NOT_FOUND', 'Automation not found', 404);
      
      const jobId = await this.runtime.jobQueue.enqueue({
        type: 'AUTOMATION_RUN',
        payload: { automationId: id, manual: true },
        priority: 10 as any,
        automationId: id as string,
        maxAttempts: 1,
        recoveryPolicy: 'FAIL' as any
      });

      res.json({ success: true, jobId });
    } catch (err) {
      next(err);
    }
  };
}
