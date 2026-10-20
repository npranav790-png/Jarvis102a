import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';

export class RuntimeController {
  constructor(private runtime: JarvisRuntime) {}

  public health = (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = this.runtime.getStatus();
      
      const dbStatus = this.runtime.engine.db.connect() ? 'healthy' : 'unavailable';
      const isDegraded = status.state !== 'RUNNING' || dbStatus !== 'healthy';

      res.status(isDegraded ? 200 : 200).json({
        status: isDegraded ? 'DEGRADED' : 'HEALTHY',
        details: {
          runtime: status.state,
          database: dbStatus,
          uptime: status.uptime,
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public status = (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = this.runtime.getStatus();
      res.json(status);
    } catch (err) {
      next(err);
    }
  };

  public captureScreen = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tool = this.runtime.engine.toolRegistry.get('desktop_screen_capture');
      if (!tool) {
        res.status(404).json({ error: 'Screen capture tool not found' });
        return;
      }
      const result = await tool.execute(req.body || {}, { actor: 'api' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
