import { spawn, ChildProcess } from 'node:child_process';
import { z } from 'zod';
import { ITool, ToolDefinition, ToolExecutionContext } from '../types.js';
import { FilesystemSandbox } from '../../security/sandbox.js';
import { ValidationError, ToolExecutionError } from '../../errors/base.js';

interface TrackedProcess {
  pid: number;
  command: string;
  child: ChildProcess;
  startedAt: string;
  exitCode: number | null;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'KILLED';
}

const activeProcesses = new Map<number, TrackedProcess>();

/**
 * process.start - Starts a monitored process in the workspace.
 */
export const processStartTool: ITool<{
  command: string;
  args?: string[];
  workingDirectory?: string;
}, { pid: number; command: string; status: string }> = {
  name: 'process.start',
  description: 'Starts a background process within the permitted workspace directory.',
  version: '1.0.0',
  category: 'EXECUTE',
  riskLevel: 'HIGH',
  capabilities: ['process.start'],
  permissions: [{ name: 'process:start', action: 'EXECUTE', riskLevel: 'HIGH', description: 'Start background processes' }],
  inputSchema: z.object({
    command: z.string().min(1, 'Command is required'),
    args: z.array(z.string()).optional().default([]),
    workingDirectory: z.string().optional().default('.'),
  }),
  outputSchema: z.object({
    pid: z.number(),
    command: z.string(),
    status: z.string(),
  }),
  execute: async (input, context) => {
    const rootPath = context.rootPath || (context.project as any)?.rootPath || process.cwd();
    const cwd = FilesystemSandbox.resolveSecurePath(input.workingDirectory || '.', rootPath);

    const safeEnv = FilesystemSandbox.filterEnvironment(process.env);
    const child = spawn(input.command, input.args || [], {
      cwd,
      env: safeEnv,
      windowsHide: true,
      stdio: 'ignore',
      detached: false,
    });

    if (!child.pid) {
      throw new ToolExecutionError('process.start', `Failed to obtain PID for command '${input.command}'`);
    }

    const tracked: TrackedProcess = {
      pid: child.pid,
      command: `${input.command} ${(input.args || []).join(' ')}`.trim(),
      child,
      startedAt: new Date().toISOString(),
      exitCode: null,
      status: 'RUNNING',
    };

    activeProcesses.set(child.pid, tracked);

    child.on('close', (code) => {
      tracked.exitCode = code;
      tracked.status = code === 0 ? 'COMPLETED' : 'FAILED';
    });

    child.on('error', () => {
      tracked.status = 'FAILED';
    });

    return {
      pid: child.pid,
      command: tracked.command,
      status: tracked.status,
    };
  },
};

/**
 * process.status - Checks the status of a tracked process.
 */
export const processStatusTool: ITool<{ pid: number }, { pid: number; status: string; exitCode: number | null }> = {
  name: 'process.status',
  description: 'Checks the status of an active process by PID.',
  version: '1.0.0',
  category: 'READ',
  riskLevel: 'LOW',
  capabilities: ['process.status'],
  permissions: [{ name: 'process:read', action: 'READ', riskLevel: 'LOW', description: 'Inspect process status' }],
  inputSchema: z.object({
    pid: z.number().int().positive('Valid PID is required'),
  }),
  outputSchema: z.object({
    pid: z.number(),
    status: z.string(),
    exitCode: z.number().nullable(),
  }),
  execute: async (input) => {
    const tracked = activeProcesses.get(input.pid);
    if (!tracked) {
      // Check if process exists in OS
      try {
        process.kill(input.pid, 0);
        return { pid: input.pid, status: 'RUNNING_UNTRACKED', exitCode: null };
      } catch {
        return { pid: input.pid, status: 'NOT_FOUND', exitCode: null };
      }
    }

    return {
      pid: tracked.pid,
      status: tracked.status,
      exitCode: tracked.exitCode,
    };
  },
};

/**
 * process.stop - Terminates an active process.
 */
export const processStopTool: ITool<{ pid: number }, { pid: number; stopped: boolean }> = {
  name: 'process.stop',
  description: 'Terminates an active process by PID.',
  version: '1.0.0',
  category: 'DESTRUCTIVE',
  riskLevel: 'MEDIUM',
  capabilities: ['process.stop'],
  permissions: [{ name: 'process:stop', action: 'DESTRUCTIVE', riskLevel: 'MEDIUM', description: 'Stop running process' }],
  inputSchema: z.object({
    pid: z.number().int().positive('Valid PID is required'),
  }),
  outputSchema: z.object({
    pid: z.number(),
    stopped: z.boolean(),
  }),
  execute: async (input) => {
    const tracked = activeProcesses.get(input.pid);
    if (tracked) {
      try {
        tracked.child.kill();
        tracked.status = 'KILLED';
        activeProcesses.delete(input.pid);
        return { pid: input.pid, stopped: true };
      } catch {
        return { pid: input.pid, stopped: false };
      }
    }

    try {
      process.kill(input.pid);
      return { pid: input.pid, stopped: true };
    } catch {
      return { pid: input.pid, stopped: false };
    }
  },
};
