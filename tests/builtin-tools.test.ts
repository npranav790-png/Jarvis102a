import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ToolRegistry } from '../dist/tools/registry.js';
import { ALL_BUILTIN_TOOLS } from '../dist/tools/builtin/index.js';

describe('Built-in Secure Tools Suite', () => {
  let registry: ToolRegistry;
  let testDir: string;

  before(() => {
    registry = new ToolRegistry();
    for (const tool of ALL_BUILTIN_TOOLS) {
      registry.register(tool);
    }
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis_tools_test_'));
  });

  after(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('all built-in tools are registered with valid metadata', () => {
    const list = registry.list();
    assert.strictEqual(list.length >= 15, true);
    for (const tool of list) {
      assert.ok(tool.name, 'Tool must have name');
      assert.ok(tool.category, 'Tool must have category');
      assert.ok(tool.riskLevel, 'Tool must have riskLevel');
      assert.ok(tool.inputSchema, 'Tool must have inputSchema');
    }
  });

  it('filesystem.create and filesystem.write create and write files safely', async () => {
    const createRes = await registry.executeTool({
      callId: 'call_create_1',
      toolName: 'filesystem.create',
      input: { path: 'hello.txt', type: 'file' },
      context: { rootPath: testDir, actor: 'test' },
    });

    assert.strictEqual(createRes.success, true);
    assert.strictEqual(createRes.status, 'SUCCESS');

    const writeRes = await registry.executeTool({
      callId: 'call_write_1',
      toolName: 'filesystem.write',
      input: { path: 'hello.txt', content: 'Hello JARVIS 2.0 World!' },
      context: { rootPath: testDir, actor: 'test' },
    });

    assert.strictEqual(writeRes.success, true);
    assert.strictEqual((writeRes.output as any).bytesWritten > 0, true);
  });

  it('filesystem.read reads text contents from workspace files', async () => {
    const readRes = await registry.executeTool({
      callId: 'call_read_1',
      toolName: 'filesystem.read',
      input: { path: 'hello.txt' },
      context: { rootPath: testDir, actor: 'test' },
    });

    assert.strictEqual(readRes.success, true);
    assert.strictEqual((readRes.output as any).content, 'Hello JARVIS 2.0 World!');
  });

  it('filesystem.list returns directory contents', async () => {
    const listRes = await registry.executeTool({
      callId: 'call_list_1',
      toolName: 'filesystem.list',
      input: { path: '.' },
      context: { rootPath: testDir, actor: 'test' },
    });

    assert.strictEqual(listRes.success, true);
    const entries = (listRes.output as any).entries;
    assert.ok(Array.isArray(entries));
    assert.ok(entries.some((e: any) => e.name === 'hello.txt'));
  });

  it('filesystem.search finds matching files by query', async () => {
    const searchRes = await registry.executeTool({
      callId: 'call_search_1',
      toolName: 'filesystem.search',
      input: { query: 'hello' },
      context: { rootPath: testDir, actor: 'test' },
    });

    assert.strictEqual(searchRes.success, true);
    const matches = (searchRes.output as any).results;
    assert.ok(matches.length > 0);
  });

  it('filesystem.delete removes file safely within workspace', async () => {
    const deleteRes = await registry.executeTool({
      callId: 'call_del_1',
      toolName: 'filesystem.delete',
      input: { path: 'hello.txt' },
      context: { rootPath: testDir, actor: 'test' },
    });

    assert.strictEqual(deleteRes.success, true);
    assert.strictEqual(fs.existsSync(path.join(testDir, 'hello.txt')), false);
  });

  it('shell.execute executes commands and captures stdout', async () => {
    const isWin = process.platform === 'win32';
    const command = isWin ? 'cmd.exe /c echo JARVIS_OK' : 'echo JARVIS_OK';

    const execRes = await registry.executeTool({
      callId: 'call_exec_1',
      toolName: 'shell.execute',
      input: { command },
      context: { rootPath: testDir, actor: 'test' },
    });

    assert.strictEqual(execRes.success, true);
    assert.ok((execRes.output as any).stdout.includes('JARVIS_OK'));
    assert.strictEqual((execRes.output as any).exitCode, 0);
  });

  it('shell.execute redacts secrets found in command stdout', async () => {
    const isWin = process.platform === 'win32';
    const secretOutput = 'Your key is gsk_1234567890abcdef1234567890abcdef12345678';
    const command = isWin ? `cmd.exe /c echo ${secretOutput}` : `echo "${secretOutput}"`;

    const execRes = await registry.executeTool({
      callId: 'call_exec_secret',
      toolName: 'shell.execute',
      input: { command },
      context: { rootPath: testDir, actor: 'test' },
    });

    assert.strictEqual(execRes.success, true);
    // Secret should be redacted in evidence
    assert.ok(execRes.evidence);
    assert.strictEqual(execRes.evidence!.includes('gsk_1234567890abcdef1234567890abcdef12345678'), false);
    assert.ok(execRes.evidence!.includes('[REDACTED_SECRET]'));
  });

  it('git.status executes safely and reports repo status', async () => {
    const gitRes = await registry.executeTool({
      callId: 'call_git_1',
      toolName: 'git.status',
      input: {},
      context: { rootPath: process.cwd(), actor: 'test' },
    });

    assert.strictEqual(gitRes.success, true);
    assert.ok(gitRes.evidence);
  });
});
