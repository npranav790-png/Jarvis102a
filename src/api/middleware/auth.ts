import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth/service.js';
import { AppError } from '../errors/api-error.js';
import { JarvisRuntime } from '../../runtime/runtime.js';

export function createAuthMiddleware(runtime: JarvisRuntime) {
  const authService = new AuthService(runtime);

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('UNAUTHORIZED', 'Missing or invalid Authorization header.', 401);
      }

      const token = authHeader.split(' ')[1];
      const payload = authService.verifyToken(token, 'access');

      const device = authService.getDevice(payload.dev);
      if (!device) {
        throw new AppError('UNAUTHORIZED', 'Device not found.', 401);
      }
      if (device.revokedAt) {
        throw new AppError('UNAUTHORIZED', 'Device is revoked.', 401);
      }

      // Update last seen asynchronously (don't await)
      authService.updateLastSeen(device.id);

      req.deviceId = device.id;
      
      // Optionally extract sessionId if provided in headers
      const sessionId = req.headers['x-session-id'];
      if (sessionId && typeof sessionId === 'string') {
        req.sessionId = sessionId;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
