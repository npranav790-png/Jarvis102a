import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { rootLogger } from '../logging/logger.js';
import { JarvisRuntime } from '../runtime/runtime.js';
import { setupRoutes } from './router.js';
import { errorHandler } from './middleware/error.js';
import { healthCheck } from '../health.js';
import { setupWebSocketServer } from './websocket/server.js';
import { AppError } from './errors/api-error.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      deviceId?: string;
      sessionId?: string;
    }
  }
}

const logger = rootLogger.child('ApiServer');

export class ApiServer {
  public readonly app: Express;
  private server: HttpServer | null = null;
  private wss: WebSocketServer | null = null;

  constructor(public readonly runtime: JarvisRuntime) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    const config = this.runtime.engine.config.api;

    // CORS
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or same-origin requests)
        if (!origin) return callback(null, true);

        // Check configured origins
        if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
          return callback(null, true);
        }

        // Allow any localhost / 127.0.0.1 development port
        try {
          const parsed = new URL(origin);
          if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return callback(null, true);
          }
        } catch {
          // ignore url parse error
        }

        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: `${config.maxBodySizeMb}mb` }));
    this.app.use(express.urlencoded({ extended: true, limit: `${config.maxBodySizeMb}mb` }));

    // Request ID and logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      res.setHeader('X-Request-ID', req.id);
      
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
          requestId: req.id,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          duration
        });
      });
      next();
    });

    // Security Headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint (public, before API prefix and error middleware)
    this.app.get('/health', healthCheck);

    const apiRouter = setupRoutes(this.runtime);
    const prefix = `/api/${this.runtime.engine.config.api.version}`;
    this.app.use(prefix, apiRouter);

    // 404 Handler
    this.app.use((req, res, next) => {
      next(new AppError('NOT_FOUND', `Route not found: ${req.method} ${req.path}`, 404));
    });

    // Error Handler
    this.app.use(errorHandler);
  }

  public getPort(): number | null {
    if (!this.server) return null;
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') return null;
    return addr.port;
  }

  public async start(): Promise<void> {
    const config = this.runtime.engine.config.api;
    if (!config.enabled) {
      logger.warn('API server is disabled in configuration.');
      return;
    }

    this.server = createServer(this.app);

    if (config.wsEnabled) {
      this.wss = new WebSocketServer({ server: this.server, path: `/api/${config.version}/ws` });
      setupWebSocketServer(this.wss, this.runtime);
      logger.info('WebSocket server initialized.');
    }

    return new Promise((resolve, reject) => {
      this.server!.listen(config.port, config.host, () => {
        const port = this.getPort() ?? config.port;
        logger.info(`JARVIS API Server listening on http://${config.host}:${port}/api/${config.version}`);
        resolve();
      });

      this.server!.on('error', (err) => {
        logger.error('Failed to start API server', undefined, err instanceof Error ? err : new Error(String(err)));
        reject(err);
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.terminate();
      }
      this.wss.close();
      this.wss = null;
    }

    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server!.close((err) => {
          if (err) return reject(err);
          this.server = null;
          logger.info('JARVIS API Server stopped.');
          resolve();
        });
      });
    }
  }
}
