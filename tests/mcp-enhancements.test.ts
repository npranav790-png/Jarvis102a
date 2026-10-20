import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { MCPClient } from '../dist/mcp/client.js';
import { MCPRegistry } from '../dist/mcp/registry.js';
import { ToolRegistry } from '../dist/tools/registry.js';

describe('JARVIS 2.0 — MCP Remote Transports & Configuration Loader', () => {
  it('1. Connects to HTTP MCP server and executes JSON-RPC tools', async () => {
    // Spin up an ephemeral HTTP server simulating an MCP HTTP server
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.method === 'initialize') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: json.id,
              result: { protocolVersion: '2024-11-05', capabilities: { tools: {} } },
            }));
          } else if (json.method === 'tools/list') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: json.id,
              result: {
                tools: [
                  {
                    name: 'lookup_user',
                    description: 'Lookup user by id',
                    inputSchema: { type: 'object', properties: { userId: { type: 'string' } } },
                  },
                ],
              },
            }));
          } else if (json.method === 'tools/call') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: json.id,
              result: {
                content: [{ type: 'text', text: `Found user: ${json.params?.arguments?.userId}` }],
              },
            }));
          } else {
            res.writeHead(404);
            res.end();
          }
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;
    const url = `http://127.0.0.1:${port}`;

    try {
      const client = new MCPClient({
        name: 'remote-http-service',
        url,
        transport: 'HTTP',
        trustLevel: 'SANDBOXED',
      });

      await client.connect();
      assert.strictEqual(client.status, 'CONNECTED');

      const tools = await client.listTools();
      assert.strictEqual(tools.length, 1);
      assert.strictEqual(tools[0].name, 'lookup_user');

      const callResult = await client.callTool('lookup_user', { userId: 'user_42' });
      assert.strictEqual(callResult.content[0].text, 'Found user: user_42');

      await client.disconnect();
      assert.strictEqual(client.status, 'DISCONNECTED');
    } finally {
      server.close();
    }
  });

  it('2. MCPRegistry.loadFromConfigFile loads and registers servers from JSON config', async () => {
    const tempConfigPath = path.join(os.tmpdir(), `jarvis_mcp_test_${Date.now()}.json`);
    const configData = {
      mcpServers: {
        'mock-service-a': {
          transport: 'IN_MEMORY',
          description: 'Mock service A',
          trustLevel: 'SANDBOXED',
          enabled: true,
        },
        'disabled-service-b': {
          transport: 'IN_MEMORY',
          description: 'Disabled service B',
          enabled: false,
        },
      },
    };

    await fs.promises.writeFile(tempConfigPath, JSON.stringify(configData));

    try {
      const toolRegistry = new ToolRegistry();
      const mcpRegistry = new MCPRegistry(toolRegistry);

      const count = await mcpRegistry.loadFromConfigFile(tempConfigPath, false);
      assert.strictEqual(count, 1);
      assert.strictEqual(mcpRegistry.hasServer('mock-service-a'), true);
      assert.strictEqual(mcpRegistry.hasServer('disabled-service-b'), false);

      const cfg = mcpRegistry.listServers().find(s => s.name === 'mock-service-a');
      assert.ok(cfg);
      assert.strictEqual(cfg.description, 'Mock service A');
      assert.strictEqual(cfg.transport, 'IN_MEMORY');
    } finally {
      await fs.promises.unlink(tempConfigPath).catch(() => {});
    }
  });
});
