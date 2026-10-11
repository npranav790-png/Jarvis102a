import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/api-error.js';
import { JarvisError } from '../../errors/base.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('ApiErrorHandler');

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  const requestId = req.id;
  
  if (err instanceof AppError) {
    logger.warn(`API Error [${err.code}]: ${err.message}`, { requestId, details: err.details });
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        details: err.details
      }
    });
    return;
  }

  if (err instanceof JarvisError) {
    logger.warn(`JARVIS Error [${err.code}]: ${err.message}`, { requestId, details: err.details });
    res.status(400).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        details: err.details
      }
    });
    return;
  }

  // Zod or other validation errors if passed directly
  if (err.name === 'ZodError') {
    logger.warn(`Validation Error`, { requestId, details: (err as any).issues });
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        requestId,
        details: (err as any).issues
      }
    });
    return;
  }

  // Unhandled internal errors
  logger.error(`Unhandled internal error: ${err.message}`, { requestId }, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
      requestId
    }
  });
}
