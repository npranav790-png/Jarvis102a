import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AuthService } from '../auth/service.js';
import { z } from 'zod';
import { AppError } from '../errors/api-error.js';

export class AuthController {
  private authService: AuthService;

  constructor(private runtime: JarvisRuntime) {
    this.authService = new AuthService(runtime);
  }

  public startPairing = (req: Request, res: Response, next: NextFunction) => {
    try {
      // In a real implementation this might require some pre-shared secret 
      // or physical server access for security. We'll leave it open for local Jarvis.
      const result = this.authService.startPairing();
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public completePairing = (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        pairingId: z.string(),
        code: z.string(),
        device: z.object({
          name: z.string(),
          platform: z.string(),
          appVersion: z.string().optional()
        })
      });

      const parsed = schema.parse(req.body);
      const result = this.authService.completePairing(parsed.pairingId, parsed.code, parsed.device);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public refreshTokens = (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        refreshToken: z.string()
      });
      const parsed = schema.parse(req.body);
      const result = this.authService.refreshTokens(parsed.refreshToken);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public listDevices = (req: Request, res: Response, next: NextFunction) => {
    try {
      const devices = this.authService.listDevices();
      res.json(devices);
    } catch (err) {
      next(err);
    }
  };

  public revokeDevice = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      if (!id) throw new AppError('BAD_REQUEST', 'Device ID required');
      this.authService.revokeDevice(id);
      res.json({ success: true, revokedDeviceId: id });
    } catch (err) {
      next(err);
    }
  };

  public pingDevice = (req: Request, res: Response, next: NextFunction) => {
    try {
      const deviceId = (req.params.id as string) || (req as any).user?.dev;
      if (deviceId) {
        this.authService.updateLastSeen(deviceId);
      }
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };
}
