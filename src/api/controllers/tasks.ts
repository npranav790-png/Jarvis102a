import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';

export class TasksController {
  constructor(private runtime: JarvisRuntime) {}

  public list = (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const tasks = this.runtime.engine.db.connect().prepare(`
        SELECT id, title, type, status, priority, created_at as createdAt 
        FROM tasks 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(limit);
      res.json(tasks);
    } catch (err) {
      next(err);
    }
  };

  public get = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const task = this.runtime.engine.taskManager.getTask(id);
      if (!task) throw new AppError('NOT_FOUND', 'Task not found', 404);
      res.json(task);
    } catch (err) {
      next(err);
    }
  };

  public cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      this.runtime.engine.db.connect().prepare(`UPDATE tasks SET status = ? WHERE id = ?`).run('FAILED', id);
      res.json({ success: true, taskId: id });
    } catch (err) {
      next(err);
    }
  };

  public retry = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      this.runtime.engine.db.connect().prepare(`UPDATE tasks SET status = ? WHERE id = ?`).run('QUEUED', id);
      res.json({ success: true, taskId: id });
    } catch (err) {
      next(err);
    }
  };
}
