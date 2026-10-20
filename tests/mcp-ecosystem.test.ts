import { describe, it } from 'node:test';
import assert from 'node:assert';
import { webSearchTool } from '../dist/tools/builtin/web-search.js';
import { githubSearchTool } from '../dist/tools/builtin/github.js';
import { MCPRegistry } from '../dist/mcp/registry.js';
import { ToolRegistry } from '../dist/tools/registry.js';

describe('JARVIS 2.0 — MCP Ecosystem & Live Built-in Tools', () => {
  it('1. webSearchTool executes zero-cost web search and returns structured results', async () => {
    assert.strictEqual(webSearchTool.name, 'web_search');
    assert.strictEqual(webSearchTool.category, 'NETWORK');
    assert.strictEqual(webSearchTool.riskLevel, 'LOW');

    const output = await webSearchTool.execute({
      query: 'TypeScript 5.7 release notes',
      maxResults: 3,
    });

    assert.ok(output);
    assert.strictEqual(output.query, 'TypeScript 5.7 release notes');
    assert.ok(Array.isArray(output.results));
    assert.ok(output.results.length >= 1);
    assert.ok(output.results[0].title);
    assert.ok(output.results[0].url);
  });

  it('2. githubSearchTool executes zero-cost repository search and returns structured results', async () => {
    assert.strictEqual(githubSearchTool.name, 'github_search_repos');
    assert.strictEqual(githubSearchTool.category, 'NETWORK');
    assert.strictEqual(githubSearchTool.riskLevel, 'LOW');

    const output = await githubSearchTool.execute({
      query: 'modelcontextprotocol',
      maxResults: 3,
    });

    assert.ok(output);
    assert.strictEqual(output.query, 'modelcontextprotocol');
    assert.ok(Array.isArray(output.repositories));
    assert.ok(output.repositories.length >= 1);
    assert.ok(output.repositories[0].name);
    assert.ok(output.repositories[0].url);
  });

  it('3. MCPRegistry loads production configs from config/mcp_servers.json', async () => {
    const toolRegistry = new ToolRegistry();
    const mcpRegistry = new MCPRegistry(toolRegistry);

    const count = await mcpRegistry.loadFromConfigFile('config/mcp_servers.json');
    assert.ok(count >= 3, `Expected at least 3 MCP servers, found ${count}`);

    const servers = mcpRegistry.listServers();
    const names = servers.map((s) => s.name);
    assert.ok(names.includes('github'), 'github MCP server should be present');
    assert.ok(names.includes('brave-search'), 'brave-search MCP server should be present');
    assert.ok(names.includes('sqlite-explorer'), 'sqlite-explorer MCP server should be present');

    for (const server of servers) {
      if (server.name === 'remote-tools') {
        assert.strictEqual(server.trustLevel, 'UNTRUSTED');
      } else {
        assert.strictEqual(server.trustLevel, 'SANDBOXED');
      }
    }
  });
});
