import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MCPServerConfig, MCPConnectionStatus } from './types.js';
import { MCPClient } from './client.js';
import { MCPToolAdapter } from './tool-adapter.js';
import { ToolRegistry } from '../tools/registry.js';
import { MCPRepository, MCPServerRecord } from '../database/repository.js';
import { MCPServerNotFoundError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('MCPRegistry');

export class MCPRegistry {
  private servers = new Map<string, { config: MCPServerConfig; client: MCPClient }>();

  constructor(
    private toolRegistry: ToolRegistry,
    private mcpRepo?: MCPRepository,
    private eventBus?: EventBus
  ) {}

  public async registerServer(config: MCPServerConfig): Promise<MCPClient> {
    const id = config.id || `mcp_${crypto.randomUUID().slice(0, 8)}`;
    const fullConfig: MCPServerConfig = {
      ...config,
      id,
      transport: config.transport || 'STDIO',
      trustLevel: config.trustLevel || 'UNTRUSTED',
      enabled: config.enabled !== false,
    };

    if (this.servers.has(fullConfig.name)) {
      logger.warn(`Overwriting registered MCP server: ${fullConfig.name}`);
    }

    const client = new MCPClient(fullConfig);
    this.servers.set(fullConfig.name, { config: fullConfig, client });

    if (this.mcpRepo) {
      const record: MCPServerRecord = {
        id,
        name: fullConfig.name,
        description: fullConfig.description || '',
        command: fullConfig.command || fullConfig.url || '',
        args_json: JSON.stringify(fullConfig.args || []),
        env_json: JSON.stringify(fullConfig.env || {}),
        transport: fullConfig.transport || 'STDIO',
        status: 'DISCONNECTED',
        trust_level: fullConfig.trustLevel || 'UNTRUSTED',
        permissions_json: JSON.stringify(fullConfig.permissions || []),
        metadata_json: '{}',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const existing = this.mcpRepo.findByName(fullConfig.name);
      if (existing) {
        this.mcpRepo.update({ ...record, id: existing.id });
      } else {
        this.mcpRepo.insert(record);
      }
    }

    if (this.eventBus) {
      this.eventBus.emit(
        createEvent('mcp:registered', 'MCPRegistry', {
          serverName: fullConfig.name,
          transport: fullConfig.transport,
          trustLevel: fullConfig.trustLevel,
        })
      );
    }

    logger.info(`MCP Server registered: ${fullConfig.name} (${fullConfig.command})`);
    return client;
  }

  /**
   * Connects to a registered MCP server, discovers its tools, and mounts them into ToolRegistry.
   */
  public async connectServer(name: string): Promise<void> {
    const entry = this.servers.get(name);
    if (!entry) throw new MCPServerNotFoundError(name);

    try {
      await entry.client.connect();

      // Discover and mount tools
      const tools = await entry.client.listTools();
      for (const mcpTool of tools) {
        const adapter = new MCPToolAdapter(entry.client, entry.config, mcpTool);
        this.toolRegistry.register(adapter);
      }

      if (this.mcpRepo) {
        const existing = this.mcpRepo.findByName(name);
        if (existing) {
          this.mcpRepo.update({ ...existing, status: 'CONNECTED', updated_at: new Date().toISOString() });
        }
      }

      if (this.eventBus) {
        this.eventBus.emit(
          createEvent('mcp:connected', 'MCPRegistry', {
            serverName: name,
            toolCount: tools.length,
          })
        );
      }

      logger.info(`Connected to MCP server '${name}' - Mounted ${tools.length} external tools.`);
    } catch (err: any) {
      logger.error(`Failed to connect to MCP server '${name}': ${err.message}`);
      if (this.mcpRepo) {
        const existing = this.mcpRepo.findByName(name);
        if (existing) {
          this.mcpRepo.update({ ...existing, status: 'ERROR', updated_at: new Date().toISOString() });
        }
      }
      if (this.eventBus) {
        this.eventBus.emit(
          createEvent('mcp:error', 'MCPRegistry', {
            serverName: name,
            error: err.message,
          })
        );
      }
    }
  }

  public async disconnectServer(name: string): Promise<void> {
    const entry = this.servers.get(name);
    if (!entry) throw new MCPServerNotFoundError(name);

    await entry.client.disconnect();

    if (this.mcpRepo) {
      const existing = this.mcpRepo.findByName(name);
      if (existing) {
        this.mcpRepo.update({ ...existing, status: 'DISCONNECTED', updated_at: new Date().toISOString() });
      }
    }

    if (this.eventBus) {
      this.eventBus.emit(
        createEvent('mcp:disconnected', 'MCPRegistry', { serverName: name })
      );
    }
  }

  public getClient(name: string): MCPClient {
    const entry = this.servers.get(name);
    if (!entry) throw new MCPServerNotFoundError(name);
    return entry.client;
  }

  public getStatus(name: string): MCPConnectionStatus {
    const entry = this.servers.get(name);
    if (!entry) return 'DISCONNECTED';
    return entry.client.status;
  }

  public listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values()).map(s => s.config);
  }

  public hasServer(name: string): boolean {
    return this.servers.has(name);
  }

  /**
   * Loads and registers MCP servers from a JSON configuration file (e.g. config/mcp_servers.json).
   * Supports standard Claude Desktop format ("mcpServers": { ... }) and array format.
   */
  public async loadFromConfigFile(filePath: string, autoConnect = false): Promise<number> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(fullPath)) {
        logger.debug(`MCP config file not found at: ${fullPath}`);
        return 0;
      }

      const content = await fs.promises.readFile(fullPath, 'utf8');
      const data = JSON.parse(content);
      const serverConfigs: MCPServerConfig[] = [];

      if (data && typeof data === 'object') {
        if (data.mcpServers && typeof data.mcpServers === 'object') {
          for (const [name, cfg] of Object.entries(data.mcpServers)) {
            if (cfg && typeof cfg === 'object') {
              serverConfigs.push({
                name,
                ...(cfg as any),
              });
            }
          }
        } else if (Array.isArray(data.servers)) {
          serverConfigs.push(...data.servers);
        } else if (Array.isArray(data)) {
          serverConfigs.push(...data);
        }
      }

      let registeredCount = 0;
      for (const cfg of serverConfigs) {
        if (cfg.enabled !== false) {
          await this.registerServer(cfg);
          registeredCount++;
          if (autoConnect) {
            try {
              await this.connectServer(cfg.name);
            } catch (connErr: any) {
              logger.warn(`Could not auto-connect MCP server '${cfg.name}': ${connErr.message}`);
            }
          }
        }
      }

      logger.info(`Loaded ${registeredCount} MCP servers from ${filePath}`);
      return registeredCount;
    } catch (err: any) {
      logger.error(`Failed to load MCP configuration from ${filePath}: ${err.message}`);
      return 0;
    }
  }
}
