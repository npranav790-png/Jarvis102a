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
}
