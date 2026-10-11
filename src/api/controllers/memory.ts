import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { MemoryType } from '../../brain/types.js';

export class MemoryController {
  constructor(private runtime: JarvisRuntime) {}

  public list = (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = req.query.type as MemoryType | undefined;
      const projectId = req.query.projectId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      const memories = this.runtime.engine.memoryService.listMemories({
        type: type || undefined,
        projectId: projectId || undefined,
        limit,
      });

      res.json(memories);
    } catch (err) {
      next(err);
    }
  };

  public search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req.query.q as string) || '';
      const type = req.query.type as MemoryType | undefined;
      const projectId = req.query.projectId as string | undefined;

      const results = await this.runtime.engine.memoryService.search(query, {
        targetProjectId: projectId || undefined,
        type: type || undefined,
        maxResults: 25,
      });

      res.json(results);
    } catch (err) {
      next(err);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { content, type, subject, predicate, importance } = req.body;
      if (!content || !type) {
        return res.status(400).json({ error: 'content and type are required' });
      }

      const created = await this.runtime.engine.memoryService.createMemory({
        content,
        type,
        subject,
        predicate,
        importance: importance || 'NORMAL',
        source: 'USER',
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  };

  public delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.runtime.engine.memoryService.deleteMemory(id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}
