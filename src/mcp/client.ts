import { spawn, ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { MCPServerConfig, MCPTool, MCPResource, MCPConnectionStatus, MCPJsonRpcRequest, MCPJsonRpcResponse } from './types.js';
import { FilesystemSandbox } from '../security/sandbox.js';
import { MCPConnectionError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('MCPClient');

export class MCPClient {
  public status: MCPConnectionStatus = 'DISCONNECTED';
  private process?: ChildProcess;
  private pendingRequests = new Map<string | number, { resolve: (res: any) => void; reject: (err: any) => void }>();
  private nextRequestId = 1;
  private mockTools: MCPTool[] = [];
  private mockResources: MCPResource[] = [];
  private mockToolHandlers = new Map<string, (args: any) => Promise<any> | any>();

  constructor(public readonly config: MCPServerConfig) {}

  /**
   * For in-memory mock testing without spawning real subprocesses.
   */
  public registerMockTool(tool: MCPTool, handler: (args: any) => Promise<any> | any): void {
    this.mockTools.push(tool);
    this.mockToolHandlers.set(tool.name, handler);
  }

  public registerMockResource(resource: MCPResource): void {
    this.mockResources.push(resource);
  }

  public async connect(): Promise<void> {
    if (this.status === 'CONNECTED') return;
    this.status = 'STARTING';
    logger.info(`Connecting to MCP server '${this.config.name}' [transport=${this.config.transport || 'STDIO'}]...`);

    if (this.config.transport === 'IN_MEMORY') {
      this.status = 'CONNECTED';
      logger.info(`In-memory mock MCP server '${this.config.name}' connected.`);
      return;
    }

    try {
      const safeEnv = FilesystemSandbox.filterEnvironment({
        ...process.env,
        ...this.config.env,
      });

      this.process = spawn(this.config.command, this.config.args || [], {
        env: safeEnv,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.pid) {
        throw new Error(`Failed to spawn process for MCP server '${this.config.name}'`);
      }

      const rl = readline.createInterface({
        input: this.process.stdout!,
        terminal: false,
      });

      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line.trim()) as MCPJsonRpcResponse;
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject } = this.pendingRequests.get(msg.id)!;
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
            } else {
              resolve(msg.result);
            }
          }
        } catch {
          // Ignore unparseable non-JSON output from stdio
        }
      });

      this.process.on('close', () => {
        this.status = 'DISCONNECTED';
        logger.warn(`MCP server '${this.config.name}' process exited.`);
      });

      this.process.on('error', (err) => {
        this.status = 'ERROR';
        logger.error(`MCP server '${this.config.name}' error:`, undefined, err);
      });

      // Send initialize handshake
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        clientInfo: { name: 'jarvis-2.0', version: '2.0.0' },
      });

      this.status = 'CONNECTED';
      logger.info(`MCP server '${this.config.name}' initialized successfully.`);
    } catch (err: any) {
      this.status = 'ERROR';
      logger.error(`Failed to connect to MCP server '${this.config.name}': ${err.message}`);
      throw new MCPConnectionError(this.config.name, err.message, err);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Ignore
      }
    }
    this.status = 'DISCONNECTED';
    logger.info(`MCP server '${this.config.name}' disconnected.`);
  }

  public async listTools(): Promise<MCPTool[]> {
    if (this.config.transport === 'IN_MEMORY') {
      return [...this.mockTools];
    }
    const result = await this.sendRequest<{ tools: MCPTool[] }>('tools/list', {});
    return result?.tools || [];
  }

  public async callTool(name: string, args: Record<string, unknown> = {}): Promise<{ content: Array<{ type: string; text?: string }> }> {
    if (this.config.transport === 'IN_MEMORY') {
      const handler = this.mockToolHandlers.get(name);
      if (!handler) throw new Error(`Mock MCP tool '${name}' not found.`);
      const output = await handler(args);
      return {
        content: [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) }],
      };
    }

    return this.sendRequest('tools/call', { name, arguments: args });
  }

  public async listResources(): Promise<MCPResource[]> {
    if (this.config.transport === 'IN_MEMORY') {
      return [...this.mockResources];
    }
    const result = await this.sendRequest<{ resources: MCPResource[] }>('resources/list', {});
    return result?.resources || [];
  }

  private sendRequest<T = any>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId++;
      const req: MCPJsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request '${method}' to server '${this.config.name}' timed out.`));
      }, 15000);

      this.pendingRequests.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      if (!this.process?.stdin?.writable) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        return reject(new Error(`MCP server '${this.config.name}' stdin is not writable.`));
      }

      this.process.stdin.write(JSON.stringify(req) + '\n');
    });
  }
}
