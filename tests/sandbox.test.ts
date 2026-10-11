import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import { FilesystemSandbox } from '../dist/security/sandbox.js';
import { SandboxViolationError } from '../dist/errors/base.js';

describe('Filesystem Sandbox & Path Security', () => {
  const rootPath = path.resolve(os.tmpdir(), 'jarvis_sandbox_test');

  it('safely resolves child paths inside workspace', () => {
    const resolved = FilesystemSandbox.resolveSecurePath('subdir/file.txt', rootPath);
    assert.strictEqual(resolved, path.resolve(rootPath, 'subdir', 'file.txt'));
  });

  it('rejects path traversal attempts using ../', () => {
    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath('../outside.txt', rootPath);
    }, SandboxViolationError);

    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath('sub/../../outside.txt', rootPath);
    }, SandboxViolationError);
  });

  it('rejects absolute paths targeting external drives or locations', () => {
    const externalPath = process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/etc/passwd';
    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath(externalPath, rootPath);
    }, SandboxViolationError);
  });

  it('rejects Windows Alternate Data Streams (:stream)', () => {
    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath('test.txt:hidden_stream', rootPath);
    }, SandboxViolationError);
  });

  it('rejects Windows reserved device names (CON, NUL, COM1, etc.)', () => {
    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath('CON', rootPath);
    }, SandboxViolationError);

    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath('subdir/nul.txt', rootPath);
    }, SandboxViolationError);
  });

  it('filters sensitive credentials from process environment', () => {
    const rawEnv = {
      PATH: 'C:\\Windows\\system32',
      NODE_ENV: 'test',
      GROQ_API_KEY: 'gsk_secret123',
      OPENROUTER_API_KEY: 'sk-or-secret',
      AWS_SECRET_ACCESS_KEY: 'secret_key',
      DATABASE_PASSWORD: 'mypassword',
      TOKEN: 'bearer_token',
      JARVIS_ENV: 'test',
    };

    const filtered = FilesystemSandbox.filterEnvironment(rawEnv);

    // Safe environment variables kept
    assert.strictEqual(filtered.PATH, 'C:\\Windows\\system32');
    assert.strictEqual(filtered.NODE_ENV, 'test');
    assert.strictEqual(filtered.JARVIS_ENV, 'test');

    // Secrets stripped
    assert.strictEqual(filtered.GROQ_API_KEY, undefined);
    assert.strictEqual(filtered.OPENROUTER_API_KEY, undefined);
    assert.strictEqual(filtered.AWS_SECRET_ACCESS_KEY, undefined);
    assert.strictEqual(filtered.DATABASE_PASSWORD, undefined);
    assert.strictEqual(filtered.TOKEN, undefined);
  });
});
