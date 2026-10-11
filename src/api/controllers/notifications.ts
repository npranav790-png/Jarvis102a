import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';

export class NotificationsController {
  constructor(private runtime: JarvisRuntime) {}

  public list = (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const unreadOnly = req.query.unread === 'true';
      
      let query = `SELECT id, type, title, body, priority, created_at as createdAt, read_at as readAt FROM notifications`;
      if (unreadOnly) {
        query += ` WHERE read_at IS NULL`;
      }
      query += ` ORDER BY created_at DESC LIMIT ?`;
      
      const notifications = this.runtime.engine.db.connect().prepare(query).all(limit);
      res.json(notifications);
    } catch (err) {
      next(err);
    }
  };

  public get = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const notification = this.runtime.engine.db.connect().prepare(`SELECT id, type, title, body, priority, created_at as createdAt, read_at as readAt FROM notifications WHERE id = ?`).get(id);
      if (!notification) throw new AppError('NOT_FOUND', 'Notification not found', 404);
      res.json(notification);
    } catch (err) {
      next(err);
    }
  };

  public read = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      this.runtime.engine.db.connect().prepare(`UPDATE notifications SET read_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
      res.json({ success: true, notificationId: id });
    } catch (err) {
      next(err);
    }
  };

  public readAll = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.runtime.engine.db.connect().prepare(`UPDATE notifications SET read_at = ? WHERE read_at IS NULL`).run(new Date().toISOString());
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  };
}
