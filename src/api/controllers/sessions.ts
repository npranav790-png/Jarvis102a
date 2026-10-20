import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';

export class SessionController {
  constructor(private runtime: JarvisRuntime) {}

  public list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const statusFilter = req.query.status as string | undefined;

      let sessions = this.runtime.engine.sessionManager.listSessions(projectId);
      if (statusFilter) {
        sessions = sessions.filter(s => s.status === statusFilter);
      }

      res.json(sessions);
    } catch (err) {
      next(err);
    }
  };

  public get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const session = this.runtime.engine.sessionManager.getSession(id);
      res.json(session);
    } catch (err) {
      next(err);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.runtime.engine.sessionManager.createSession(req.body || {});
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  };

  public archive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const session = this.runtime.engine.sessionManager.archiveSession(id, true);
      res.json({ success: true, session });
    } catch (err) {
      next(err);
    }
  };

  public unarchive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const session = this.runtime.engine.sessionManager.unarchiveSession(id);
      res.json({ success: true, session });
    } catch (err) {
      next(err);
    }
  };

  public export = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const format = (req.query.format as string || 'markdown').toLowerCase();
      const download = req.query.download === 'true' || req.query.download === '1';

      if (format === 'json') {
        const data = this.runtime.engine.sessionManager.exportSessionJson(id);
        if (download) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="jarvis_session_${id}.json"`);
          res.send(JSON.stringify(data, null, 2));
        } else {
          res.json({ success: true, ...data });
        }
        return;
      }

      const markdown = this.runtime.engine.sessionManager.exportSessionMarkdown(id);
      const fileName = `jarvis_session_${id}.md`;


      if (download) {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(markdown);
      } else {
        res.json({
          success: true,
          id,
          format: 'markdown',
          fileName,
          markdown,
        });
      }
    } catch (err) {
      next(err);
    }
  };
}
