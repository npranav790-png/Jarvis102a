import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';

export class JobsController {
  constructor(private runtime: JarvisRuntime) {}

  public list = (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const jobs = this.runtime.jobRepo.findPendingJobs(limit);
      res.json(jobs);
    } catch (err) {
      next(err);
    }
  };

  public get = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const job = this.runtime.engine.db.connect().prepare(`SELECT * FROM runtime_jobs WHERE id = ?`).get(id);
      if (!job) throw new AppError('NOT_FOUND', 'Job not found', 404);
      res.json(job);
    } catch (err) {
      next(err);
    }
  };

  public cancel = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      this.runtime.engine.db.connect().prepare(`UPDATE runtime_jobs SET status = ?, completed_at = ?, last_error = ? WHERE id = ?`).run('FAILED', new Date().toISOString(), 'Cancelled via API', id);
      res.json({ success: true, jobId: id });
    } catch (err) {
      next(err);
    }
  };
}
