import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/api-error.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('RateLimiter');

interface LimitRule {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

// In-memory store suitable for local-first single-instance deployment
const store = new Map<string, RateLimitState>();

export const rateLimit = (ruleName: string, rule: LimitRule) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Identity relies on authenticated deviceId or fallback to IP for unauthenticated routes
    const identifier = req.deviceId || req.ip || 'unknown';
    const key = `${ruleName}:${identifier}`;
    
    const now = Date.now();
    let state = store.get(key);
    
    if (!state || now > state.resetAt) {
      state = {
        count: 0,
        resetAt: now + rule.windowMs
      };
    }
    
    state.count++;
    store.set(key, state);
    
    res.setHeader('X-RateLimit-Limit', rule.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, rule.maxRequests - state.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(state.resetAt / 1000));
    
    if (state.count > rule.maxRequests) {
      logger.warn(`Rate limit exceeded for rule ${ruleName} by ${identifier}`);
      return next(new AppError('RATE_LIMIT_EXCEEDED', 'Too many requests, please try again later.', 429));
    }
    
    next();
  };
};

// Cleanup interval to prevent memory leaks from inactive IPs/devices
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of store.entries()) {
    if (now > state.resetAt) {
      store.delete(key);
    }
  }
}, 60000).unref();

export const RateLimits = {
  PAIRING: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 pairing attempts per 15 minutes
  STRICT: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 per minute (Approvals, etc.)
  MODERATE: { windowMs: 60 * 1000, maxRequests: 30 }, // 30 per minute (Chat, Tasks)
  HIGHER: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 per minute (Reads)
};
