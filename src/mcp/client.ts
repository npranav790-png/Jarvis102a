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
  private abortController?: AbortController;
  private ssePostUrl?: string;

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
    const transport = this.config.transport || 'STDIO';
    logger.info(`Connecting to MCP server '${this.config.name}' [transport=${transport}]...`);

    if (transport === 'IN_MEMORY') {
      this.status = 'CONNECTED';
      logger.info(`In-memory mock MCP server '${this.config.name}' connected.`);
      return;
    }

    if (transport === 'HTTP') {
      await this.connectHttp();
      return;
    }

    if (transport === 'SSE') {
      await this.connectSse();
      return;
    }

    // Default: STDIO transport
    await this.connectStdio();
  }

  private async connectStdio(): Promise<void> {
    try {
      if (!this.config.command) {
        throw new Error(`MCP server '${this.config.name}' configured for STDIO requires a 'command'`);
      }

      const safeEnv = FilesystemSandbox.filterEnvironment({
        ...process.env,
        ...this.config.env,
      });

      const isWin = process.platform === 'win32';
      let cmd = this.config.command;
      if (isWin && (cmd === 'npx' || cmd === 'npm')) {
        cmd = `${cmd}.cmd`;
      }

      this.process = spawn(cmd, this.config.args || [], {
        env: safeEnv,
        windowsHide: true,
        shell: isWin,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.on('error', (err) => {
        this.status = 'ERROR';
        logger.error(`MCP server '${this.config.name}' process error: ${err.message}`);
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
          this.handleJsonRpcResponse(msg);
        } catch {
          // Ignore unparseable non-JSON output from stdio
        }
      });

      this.process.on('close', () => {
        this.status = 'DISCONNECTED';
        logger.warn(`MCP server '${this.config.name}' process exited.`);
      });

      // Send initialize handshake
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        clientInfo: { name: 'jarvis-2.0', version: '2.1.2' },
      });

      this.status = 'CONNECTED';
      logger.info(`MCP server '${this.config.name}' initialized successfully.`);
    } catch (err: any) {
      this.status = 'ERROR';
      logger.error(`Failed to connect to MCP server '${this.config.name}': ${err.message}`);
      throw new MCPConnectionError(this.config.name, err.message, err);
    }
  }

  private async connectHttp(): Promise<void> {
    if (!this.config.url) {
      this.status = 'ERROR';
      throw new MCPConnectionError(this.config.name, `HTTP transport requires a 'url'`);
    }

    try {
      this.abortController = new AbortController();
      // Initialize handshake over HTTP POST
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        clientInfo: { name: 'jarvis-2.0', version: '2.1.2' },
      });

      this.status = 'CONNECTED';
      logger.info(`MCP HTTP server '${this.config.name}' connected at ${this.config.url}`);
    } catch (err: any) {
      this.status = 'ERROR';
      logger.error(`Failed to connect to MCP HTTP server '${this.config.name}': ${err.message}`);
      throw new MCPConnectionError(this.config.name, err.message, err);
    }
  }

  private async connectSse(): Promise<void> {
    if (!this.config.url) {
      this.status = 'ERROR';
      throw new MCPConnectionError(this.config.name, `SSE transport requires a 'url'`);
    }

    try {
      this.abortController = new AbortController();
      const sseUrl = this.config.url;

      // Start SSE listener
      this.startSseListener(sseUrl).catch((err) => {
        if (this.status === 'CONNECTED' || this.status === 'STARTING') {
          logger.warn(`SSE stream connection ended for '${this.config.name}': ${err.message}`);
        }
      });

      // Give SSE connection a brief moment to discover post endpoint if emitted
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send initialize handshake
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        clientInfo: { name: 'jarvis-2.0', version: '2.1.2' },
      });

      this.status = 'CONNECTED';
      logger.info(`MCP SSE server '${this.config.name}' connected at ${sseUrl}`);
    } catch (err: any) {
      this.status = 'ERROR';
      logger.error(`Failed to connect to MCP SSE server '${this.config.name}': ${err.message}`);
      throw new MCPConnectionError(this.config.name, err.message, err);
    }
  }

  private async startSseListener(url: string): Promise<void> {
    const res = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: this.abortController?.signal,
    });

    if (!res.ok) {
      throw new Error(`SSE endpoint returned HTTP ${res.status}: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error('SSE response body is empty');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.substring(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.substring(5).trim();
          if (currentEvent === 'endpoint') {
            // Relative or absolute URL for sending JSON-RPC messages
            try {
              this.ssePostUrl = new URL(dataStr, url).toString();
            } catch {
              this.ssePostUrl = dataStr;
            }
            logger.debug(`MCP SSE server '${this.config.name}' announced message endpoint: ${this.ssePostUrl}`);
          } else {
            try {
              const msg = JSON.parse(dataStr) as MCPJsonRpcResponse;
              this.handleJsonRpcResponse(msg);
            } catch {
              // Non-JSON SSE message
            }
          }
          currentEvent = 'message';
        }
      }
    }
  }

  private handleJsonRpcResponse(msg: MCPJsonRpcResponse): void {
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
      } else {
        resolve(msg.result);
      }
    }
  }

  public async disconnect(): Promise<void> {
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        // Ignore
      }
      this.abortController = undefined;
    }

    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Ignore
      }
      this.process = undefined;
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
    const transport = this.config.transport || 'STDIO';

    if (transport === 'HTTP' || transport === 'SSE') {
      return this.sendHttpRequest<T>(method, params);
    }

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

  private async sendHttpRequest<T = any>(method: string, params: Record<string, unknown>): Promise<T> {
    const targetUrl = this.ssePostUrl || this.config.url;
    if (!targetUrl) {
      throw new Error(`MCP server '${this.config.name}' has no endpoint URL for sending requests.`);
    }

    const id = this.nextRequestId++;
    const req: MCPJsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP request '${method}' failed with status ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    if (!text.trim()) {
      // Server returned empty body, waiting for response on SSE stream
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request '${method}' over SSE timed out.`));
        }, 15000);

        this.pendingRequests.set(id, {
          resolve: (val) => { clearTimeout(timer); resolve(val); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        });
      });
    }

    const parsed = JSON.parse(text) as MCPJsonRpcResponse;
    if (parsed.error) {
      throw new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`);
    }

    return parsed.result as T;
  }
}
