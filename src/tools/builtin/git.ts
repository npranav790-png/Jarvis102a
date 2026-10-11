import { spawn } from 'node:child_process';
import { z } from 'zod';
import { ITool, ToolDefinition, ToolExecutionContext } from '../types.js';
import { FilesystemSandbox } from '../../security/sandbox.js';
import { ValidationError, ToolExecutionError } from '../../errors/base.js';

function getGitCwd(context: ToolExecutionContext): string {
  const root = context.rootPath || (context.project as any)?.rootPath || process.cwd();
  return FilesystemSandbox.resolveSecurePath('.', root);
}

function runGit(args: string[], cwd: string, timeoutMs: number = 15000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      shell: process.platform === 'win32',
      env: FilesystemSandbox.filterEnvironment(process.env),
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new ToolExecutionError('git', `Git command 'git ${args[0]}' timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout?.on('data', chunk => { stdout += chunk.toString('utf-8'); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString('utf-8'); });

    child.on('error', err => {
      clearTimeout(timer);
      reject(new ToolExecutionError('git', `Failed to spawn git: ${err.message}`, err));
    });

    child.on('close', code => {
      clearTimeout(timer);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0 });
    });
  });
}

/**
 * git.status - Reports working tree status.
 */
export const gitStatusTool: ITool<{ path?: string }, { status: string; clean: boolean }> = {
  name: 'git.status',
  description: 'Checks the git repository status in the workspace.',
  version: '1.0.0',
  category: 'READ',
  riskLevel: 'LOW',
  capabilities: ['git.status', 'git.read'],
  permissions: [{ name: 'git:read', action: 'READ', riskLevel: 'LOW', description: 'Inspect git repository status' }],
  inputSchema: z.object({
    path: z.string().optional().default('.'),
  }),
  outputSchema: z.object({
    status: z.string(),
    clean: z.boolean(),
  }),
  execute: async (input, context) => {
    const cwd = getGitCwd(context);
    const { stdout, stderr, exitCode } = await runGit(['status', '--short'], cwd);

    if (exitCode !== 0 && stderr.includes('not a git repository')) {
      return { status: 'NOT_A_GIT_REPOSITORY', clean: false };
    }

    return {
      status: stdout || 'Working tree clean',
      clean: stdout.length === 0,
    };
  },
};

/**
 * git.diff - Reports changes in working tree.
 */
export const gitDiffTool: ITool<{ staged?: boolean; path?: string }, { diff: string }> = {
  name: 'git.diff',
  description: 'Shows unstaged or staged git changes.',
  version: '1.0.0',
  category: 'READ',
  riskLevel: 'LOW',
  capabilities: ['git.diff', 'git.read'],
  permissions: [{ name: 'git:read', action: 'READ', riskLevel: 'LOW', description: 'View git diffs' }],
  inputSchema: z.object({
    staged: z.boolean().optional().default(false),
    path: z.string().optional(),
  }),
  outputSchema: z.object({
    diff: z.string(),
  }),
  execute: async (input, context) => {
    const cwd = getGitCwd(context);
    const args = ['diff'];
    if (input.staged) args.push('--staged');
    if (input.path) args.push(input.path);

    const { stdout } = await runGit(args, cwd);
    return { diff: stdout || 'No changes.' };
  },
};

/**
 * git.log - Shows commit history.
 */
export const gitLogTool: ITool<{ maxCount?: number }, { commits: string[] }> = {
  name: 'git.log',
  description: 'Shows recent git commit history.',
  version: '1.0.0',
  category: 'READ',
  riskLevel: 'LOW',
  capabilities: ['git.log', 'git.read'],
  permissions: [{ name: 'git:read', action: 'READ', riskLevel: 'LOW', description: 'View git commit history' }],
  inputSchema: z.object({
    maxCount: z.number().optional().default(10),
  }),
  outputSchema: z.object({
    commits: z.array(z.string()),
  }),
  execute: async (input, context) => {
    const cwd = getGitCwd(context);
    const count = Math.min(input.maxCount || 10, 50);
    const { stdout, exitCode } = await runGit(['log', `-${count}`, '--oneline'], cwd);

    if (exitCode !== 0 || !stdout) {
      return { commits: [] };
    }

    return { commits: stdout.split('\n').filter(Boolean) };
  },
};

/**
 * git.branch - Lists or creates branches.
 */
export const gitBranchTool: ITool<{ action?: 'LIST' | 'CREATE'; branchName?: string }, { currentBranch: string; branches: string[] }> = {
  name: 'git.branch',
  description: 'Lists or inspects repository branches.',
  version: '1.0.0',
  category: 'READ',
  riskLevel: 'LOW',
  capabilities: ['git.branch', 'git.read'],
  permissions: [{ name: 'git:read', action: 'READ', riskLevel: 'LOW', description: 'Inspect git branches' }],
  inputSchema: z.object({
    action: z.enum(['LIST', 'CREATE']).optional().default('LIST'),
    branchName: z.string().optional(),
  }),
  outputSchema: z.object({
    currentBranch: z.string(),
    branches: z.array(z.string()),
  }),
  execute: async (input, context) => {
    const cwd = getGitCwd(context);

    if (input.action === 'CREATE') {
      if (!input.branchName) throw new ValidationError('Branch name is required to create a branch.');
      await runGit(['branch', input.branchName], cwd);
    }

    const { stdout } = await runGit(['branch'], cwd);
    const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
    const current = lines.find(l => l.startsWith('*'))?.replace('*', '').trim() || '';
    const branches = lines.map(l => l.replace('*', '').trim());

    return { currentBranch: current, branches };
  },
};

/**
 * git.add - Stages files for commit.
 */
export const gitAddTool: ITool<{ files: string[] }, { staged: string[] }> = {
  name: 'git.add',
  description: 'Stages files for git commit.',
  version: '1.0.0',
  category: 'WRITE',
  riskLevel: 'MEDIUM',
  capabilities: ['git.add', 'git.write'],
  permissions: [{ name: 'git:write', action: 'WRITE', riskLevel: 'MEDIUM', description: 'Stage git files' }],
  inputSchema: z.object({
    files: z.array(z.string()).min(1, 'At least one file must be specified'),
  }),
  outputSchema: z.object({
    staged: z.array(z.string()),
  }),
  execute: async (input, context) => {
    const cwd = getGitCwd(context);
    if (context.dryRun) {
      return { staged: input.files };
    }

    await runGit(['add', ...input.files], cwd);
    return { staged: input.files };
  },
};

/**
 * git.commit - Creates a git commit.
 */
export const gitCommitTool: ITool<{ message: string }, { message: string; committed: boolean }> = {
  name: 'git.commit',
  description: 'Commits staged changes to the repository.',
  version: '1.0.0',
  category: 'WRITE',
  riskLevel: 'MEDIUM',
  capabilities: ['git.commit', 'git.write'],
  permissions: [{ name: 'git:write', action: 'WRITE', riskLevel: 'MEDIUM', description: 'Commit git changes' }],
  inputSchema: z.object({
    message: z.string().min(1, 'Commit message is required'),
  }),
  outputSchema: z.object({
    message: z.string(),
    committed: z.boolean(),
  }),
  execute: async (input, context) => {
    const cwd = getGitCwd(context);
    if (context.dryRun) {
      return { message: input.message, committed: false };
    }

    const { stdout, stderr, exitCode } = await runGit(['commit', '-m', input.message], cwd);
    if (exitCode !== 0) {
      throw new ToolExecutionError('git.commit', stderr || stdout || 'Nothing to commit');
    }

    return { message: input.message, committed: true };
  },
};
