import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';
import { z } from 'zod';

export class RemindersController {
  constructor(private runtime: JarvisRuntime) {}

  public list = (req: Request, res: Response, next: NextFunction) => {
    try {
      const reminders = this.runtime.engine.db.connect().prepare(`SELECT * FROM reminders WHERE status = 'SCHEDULED' ORDER BY scheduled_at ASC LIMIT 100`).all();
      res.json(reminders);
    } catch (err) {
      next(err);
    }
  };

  public get = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const reminder = this.runtime.engine.db.connect().prepare(`SELECT * FROM reminders WHERE id = ?`).get(id);
      if (!reminder) throw new AppError('NOT_FOUND', 'Reminder not found', 404);
      res.json(reminder);
    } catch (err) {
      next(err);
    }
  };

  public create = (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        title: z.string(),
        description: z.string().optional(),
        scheduledAt: z.string().datetime(),
        timezone: z.string().optional(),
        priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional()
      });
      const parsed = schema.parse(req.body);
      
      
      const id = `rem_${Date.now()}`;
      this.runtime.engine.db.connect().prepare(`
        INSERT INTO reminders (id, title, description, scheduled_at, timezone, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, parsed.title, parsed.description || '', parsed.scheduledAt, 
        parsed.timezone || 'UTC', parsed.priority || 'NORMAL', 'SCHEDULED', new Date().toISOString()
      );
      
      const reminder = this.runtime.engine.db.connect().prepare(`SELECT * FROM reminders WHERE id = ?`).get(id);

      res.json(reminder);
    } catch (err) {
      next(err);
    }
  };

  public cancel = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      this.runtime.engine.db.connect().prepare(`UPDATE reminders SET status = ? WHERE id = ?`).run('CANCELLED', id);
      res.json({ success: true, reminderId: id });
    } catch (err) {
      next(err);
    }
  };
}
