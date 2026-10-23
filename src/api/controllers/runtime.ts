import { Request, Response, NextFunction } from 'express';
import os from 'node:os';
import { execSync } from 'node:child_process';
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

  public executeDesktopControl = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tool = this.runtime.engine.toolRegistry.get('desktop_control');
      if (!tool) {
        res.status(404).json({ error: 'Desktop control tool not found' });
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

  public getBriefing = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const memUsagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
      const osCpus = os.cpus();

      const modelMode = (this.runtime as any).modelMode || 'CLOUD';
      const pendingApprovals = (this.runtime as any).approvals?.getPending?.()?.length || 0;
      const activeTasks = (this.runtime as any).tasks?.getActive?.()?.length || 0;

      let gitBranch = 'main';
      let gitClean = true;
      try {
        const branchOut = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        if (branchOut) gitBranch = branchOut;
        const statusOut = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        gitClean = statusOut.length === 0;
      } catch {}

      const hour = new Date().getHours();
      let greeting = 'Good morning';
      if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
      else if (hour >= 17) greeting = 'Good evening';

      const briefingText = `${greeting}, Sir. All primary systems are operational. Memory utilization is at ${memUsagePercent} percent, and runtime uptime is ${Math.round(process.uptime() / 60)} minutes. You have ${pendingApprovals} pending security approvals and ${activeTasks} active tasks. Your repository is ${gitClean ? 'clean' : 'modified'} on branch ${gitBranch}. Core intelligence is running in ${modelMode} mode. Ready for your command.`;

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        greeting,
        briefingText,
        metrics: {
          uptimeSeconds: Math.round(process.uptime()),
          uptimeMinutes: Math.round(process.uptime() / 60),
          memoryUsagePercent: memUsagePercent,
          totalMemoryGb: (totalMem / (1024 ** 3)).toFixed(1),
          usedMemoryGb: ((totalMem - freeMem) / (1024 ** 3)).toFixed(1),
          cpuCores: osCpus.length,
          cpuModel: osCpus[0]?.model || 'Host CPU',
          modelMode,
          pendingApprovals,
          activeTasks,
          gitBranch,
          gitClean,
        }
      });
    } catch (err) {
      next(err);
    }
  };
}
