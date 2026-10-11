import { Request, Response, NextFunction } from 'express';

export function healthCheck(_req: Request, res: Response, next: NextFunction): void {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const heapUsedMb = Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime,
      memoryUsage: heapUsedMb,
    });
  } catch (err) {
    next(err);
  }
}