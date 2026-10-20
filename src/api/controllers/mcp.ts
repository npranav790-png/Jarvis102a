import { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('MCPController');

export class MCPController {
  constructor(private runtime: JarvisRuntime) {}

  public list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const registry = this.runtime.engine.mcpRegistry;
      if (registry.listServers().length === 0) {
        // Try loading from config if not yet loaded
        const configPath = this.runtime.engine.config.mcp?.configPath || 'config/mcp_servers.json';
        await registry.loadFromConfigFile(configPath);
      }

      const servers = registry.listServers().map((cfg) => {
        const status = registry.getStatus(cfg.name);
        return {
          id: cfg.id,
          name: cfg.name,
          description: cfg.description || '',
          transport: cfg.transport,
          trustLevel: cfg.trustLevel,
          command: cfg.command || cfg.url,
          enabled: cfg.enabled !== false,
          status,
        };
      });

      res.json({
        success: true,
        servers,
        total: servers.length,
      });
    } catch (err) {
      next(err);
    }
  };

  public connect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = (Array.isArray(req.params.name) ? req.params.name[0] : req.params.name) || '';
      const registry = this.runtime.engine.mcpRegistry;

      if (!registry.hasServer(name)) {
        res.status(404).json({ success: false, error: `MCP server '${name}' not found.` });
        return;
      }

      await registry.connectServer(name);
      const status = registry.getStatus(name);

      res.json({
        success: true,
        message: `MCP server '${name}' connected successfully.`,
        server: { name, status },
      });
    } catch (err: any) {
      logger.error(`Error connecting to MCP server: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public disconnect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = (Array.isArray(req.params.name) ? req.params.name[0] : req.params.name) || '';
      const registry = this.runtime.engine.mcpRegistry;

      if (!registry.hasServer(name)) {
        res.status(404).json({ success: false, error: `MCP server '${name}' not found.` });
        return;
      }

      await registry.disconnectServer(name);
      res.json({
        success: true,
        message: `MCP server '${name}' disconnected.`,
        server: { name, status: 'DISCONNECTED' },
      });
    } catch (err: any) {
      logger.error(`Error disconnecting MCP server: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public toggle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = (Array.isArray(req.params.name) ? req.params.name[0] : req.params.name) || '';
      const { enabled } = req.body;

      const configPath = path.resolve(
        process.cwd(),
        this.runtime.engine.config.mcp?.configPath || 'config/mcp_servers.json'
      );

      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed.mcpServers && parsed.mcpServers[name]) {
          parsed.mcpServers[name].enabled = !!enabled;
          fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf8');
        }
      }

      res.json({
        success: true,
        message: `MCP server '${name}' set to ${enabled ? 'enabled' : 'disabled'}.`,
      });
    } catch (err: any) {
      next(err);
    }
  };
}
