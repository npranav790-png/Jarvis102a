import { spawn } from 'node:child_process';
import { z } from 'zod';
import { ITool, ToolDefinition, ToolExecutionContext } from '../types.js';
import { FilesystemSandbox } from '../../security/sandbox.js';
import { MemorySanitizer } from '../../brain/memory/sanitizer.js';
import { ValidationError, ToolTimeoutError, ToolExecutionError } from '../../errors/base.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('ShellTool');

// Explicitly blocked destructive or dangerous executables/commands
const BLOCKED_COMMANDS = new Set([
  'format',
  'diskpart',
  'reg',
  'regedit',
  'mkfs',
  'fdisk',
  'dd',
  'shutdown',
  'reboot',
  'init',
]);

export interface ShellExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  outputTruncated: boolean;
}

export const shellExecuteTool: ITool<{
  command: string;
  args?: string[];
  workingDirectory?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}, ShellExecuteResult> = {
  name: 'shell.execute',
  description: 'Executes a command securely within the permitted workspace directory.',
  version: '1.0.0',
  category: 'EXECUTE',
  riskLevel: 'HIGH',
  capabilities: ['shell.execute'],
  supportsCancellation: true,
  permissions: [{
    name: 'shell:execute',
    action: 'EXECUTE',
    riskLevel: 'HIGH',
    description: 'Execute shell commands and subprocesses',
  }],
  inputSchema: z.object({
    command: z.string().min(1, 'Command is required'),
    args: z.array(z.string()).optional().default([]),
    workingDirectory: z.string().optional().default('.'),
    timeoutMs: z.number().optional().default(30000), // 30s default
    maxOutputBytes: z.number().optional().default(64 * 1024), // 64KB max output
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    durationMs: z.number(),
    outputTruncated: z.boolean(),
  }),
  definition(): ToolDefinition {
    return {
      id: 'shell.execute',
      name: this.name,
      description: this.description,
      version: this.version,
      category: this.category,
      riskLevel: this.riskLevel,
      capabilities: this.capabilities || [],
      permissions: this.permissions,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      supportsDryRun: false,
      supportsCancellation: true,
      status: 'AVAILABLE',
    };
  },
  execute: async (input, context) => {
    const rootPath = context.rootPath || (context.project as any)?.rootPath || process.cwd();
    const cwd = FilesystemSandbox.resolveSecurePath(input.workingDirectory || '.', rootPath);

    // 1. Command Validation & Blocking
    const baseCommand = input.command.trim().split(/\s+/)[0].toLowerCase();
    if (BLOCKED_COMMANDS.has(baseCommand)) {
      throw new ValidationError(`Execution of forbidden system command '${baseCommand}' is blocked by security policy.`);
    }

    // Check for obvious shell injection attacks in raw string if piped
    if (/;\s*(rm\s+-rf|format|del\s+\/f)\b/i.test(input.command)) {
      throw new ValidationError(`Destructive command injection detected in shell instruction.`);
    }

    const timeoutMs = Math.min(input.timeoutMs || 30000, 120000); // Max 120s
    const maxBytes = input.maxOutputBytes || 64 * 1024;
    const safeEnv = FilesystemSandbox.filterEnvironment(process.env);

    const startTime = Date.now();

    return new Promise<ShellExecuteResult>((resolve, reject) => {
      let isTimeout = false;
      let outputTruncated = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Determine shell executable depending on platform
      const isWindows = process.platform === 'win32';
      let executable: string;
      let commandArgs: string[];

      if (input.args && input.args.length > 0) {
        executable = input.command;
        commandArgs = input.args;
      } else {
        // Run via platform shell
        executable = isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh';
        commandArgs = isWindows ? ['/d', '/s', '/c', input.command] : ['-c', input.command];
      }

      logger.info(`Spawning process: ${executable} in ${cwd}`);

      const child = spawn(executable, commandArgs, {
        cwd,
        env: safeEnv,
        windowsHide: true,
        shell: false,
      });

      // Cancellation listener
      if (context.signal) {
        if (context.signal.aborted) {
          child.kill();
          return reject(new ToolExecutionError('shell.execute', 'Execution cancelled by signal'));
        }
        context.signal.addEventListener('abort', () => {
          child.kill();
          reject(new ToolExecutionError('shell.execute', 'Execution cancelled by signal'));
        }, { once: true });
      }

      // Timeout timer
      const timer = setTimeout(() => {
        isTimeout = true;
        child.kill();
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        if (Buffer.byteLength(stdoutBuffer) < maxBytes) {
          stdoutBuffer += chunk.toString('utf-8');
        } else {
          outputTruncated = true;
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        if (Buffer.byteLength(stderrBuffer) < maxBytes) {
          stderrBuffer += chunk.toString('utf-8');
        } else {
          outputTruncated = true;
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new ToolExecutionError('shell.execute', err.message, err));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        if (isTimeout) {
          return reject(new ToolTimeoutError('shell.execute', timeoutMs));
        }

        // Sanitize any detected secrets from output
        const cleanStdout = MemorySanitizer.redactSecrets(stdoutBuffer);
        const cleanStderr = MemorySanitizer.redactSecrets(stderrBuffer);

        resolve({
          stdout: cleanStdout,
          stderr: cleanStderr,
          exitCode: code ?? 0,
          durationMs,
          outputTruncated,
        });
      });
    });
  },
};
