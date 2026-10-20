import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { DatabaseBackupService } from '../../database/backup.js';

export class RuntimeController {
  private backupService: DatabaseBackupService;

  constructor(private runtime: JarvisRuntime) {
    this.backupService = new DatabaseBackupService({
      dbPath: (runtime.engine.db as any).dbPath,
    });
  }

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

  public getTelemetry = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tool = this.runtime.engine.toolRegistry.get('system_resource_monitor');
      if (!tool) {
        res.status(404).json({ error: 'System resource monitor tool not found' });
        return;
      }
      const result = await tool.execute(req.query || {}, { actor: 'api' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public notify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tool = this.runtime.engine.toolRegistry.get('system_notification');
      if (!tool) {
        res.status(404).json({ error: 'System notification tool not found' });
        return;
      }
      const result = await tool.execute(req.body || {}, { actor: 'api' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public createBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = this.runtime.engine.db.connect();
      const customName = req.body?.name || req.body?.customName;
      const snapshot = await this.backupService.createSnapshot(db, customName);
      res.json({ success: true, snapshot });
    } catch (err) {
      next(err);
    }
  };

  public listBackups = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const backups = this.backupService.listSnapshots();
      res.json({ success: true, count: backups.length, backups });
    } catch (err) {
      next(err);
    }
  };

  public restoreBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fileNameOrPath = req.body?.fileName || req.body?.filePath;
      if (!fileNameOrPath) {
        res.status(400).json({ error: 'fileName or filePath is required' });
        return;
      }
      const result = await this.backupService.restoreSnapshot(fileNameOrPath);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
