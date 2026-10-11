import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ITool, ToolDefinition, ToolExecutionContext } from '../types.js';
import { FilesystemSandbox } from '../../security/sandbox.js';
import { ValidationError, SandboxViolationError } from '../../errors/base.js';

function getRootPath(context: ToolExecutionContext): string {
  return context.rootPath || (context.project as any)?.rootPath || process.cwd();
}

/**
 * filesystem.list - Lists files and directories within a workspace directory.
 */
export const filesystemListTool: ITool<{ path?: string; recursive?: boolean }, { entries: Array<{ name: string; isDirectory: boolean; size: number }> }> = {
  name: 'filesystem.list',
  description: 'Lists files and directories inside a permitted workspace path.',
  version: '1.0.0',
  category: 'READ',
  riskLevel: 'LOW',
  capabilities: ['filesystem.list', 'filesystem.read'],
  permissions: [{ name: 'filesystem:read', action: 'READ', riskLevel: 'LOW', description: 'Read filesystem contents' }],
  inputSchema: z.object({
    path: z.string().optional().default('.'),
    recursive: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({
    entries: z.array(z.object({
      name: z.string(),
      isDirectory: z.boolean(),
      size: z.number(),
    })),
  }),
  definition(): ToolDefinition {
    return {
      id: 'filesystem.list',
      name: this.name,
      description: this.description,
      version: this.version,
      category: this.category,
      riskLevel: this.riskLevel,
      capabilities: this.capabilities || [],
      permissions: this.permissions,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      supportsDryRun: true,
      supportsCancellation: false,
      status: 'AVAILABLE',
    };
  },
  execute: async (input, context) => {
    const rootPath = getRootPath(context);
    const targetDir = FilesystemSandbox.resolveSecurePath(input.path || '.', rootPath);

    if (!fs.existsSync(targetDir)) {
      throw new ValidationError(`Directory not found: '${input.path}'`);
    }

    const dirents = fs.readdirSync(targetDir, { withFileTypes: true });
    const entries = dirents.map(d => {
      let size = 0;
      if (d.isFile()) {
        try {
          size = fs.statSync(path.join(targetDir, d.name)).size;
        } catch {
          size = 0;
        }
      }
      return {
        name: d.name,
        isDirectory: d.isDirectory(),
        size,
      };
    });

    return { entries };
  },
};

/**
 * filesystem.read - Reads text content from a workspace file.
 */
export const filesystemReadTool: ITool<{ path: string; maxBytes?: number; offset?: number }, { content: string; bytesRead: number; totalBytes: number; truncated: boolean }> = {
  name: 'filesystem.read',
  description: 'Reads text content from a file inside the permitted workspace.',
  version: '1.0.0',
  category: 'READ',
  riskLevel: 'LOW',
  capabilities: ['filesystem.read'],
  permissions: [{ name: 'filesystem:read', action: 'READ', riskLevel: 'LOW', description: 'Read file contents' }],
  inputSchema: z.object({
    path: z.string().min(1, 'File path is required'),
    maxBytes: z.number().optional().default(64 * 1024), // 64 KB limit by default
    offset: z.number().optional().default(0),
  }),
  outputSchema: z.object({
    content: z.string(),
    bytesRead: z.number(),
    totalBytes: z.number(),
    truncated: z.boolean(),
  }),
  definition(): ToolDefinition {
    return {
      id: 'filesystem.read',
      name: this.name,
      description: this.description,
      version: this.version,
      category: this.category,
      riskLevel: this.riskLevel,
      capabilities: this.capabilities || [],
      permissions: this.permissions,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      supportsDryRun: true,
      supportsCancellation: false,
      status: 'AVAILABLE',
    };
  },
  execute: async (input, context) => {
    const rootPath = getRootPath(context);
    const targetFile = FilesystemSandbox.resolveSecurePath(input.path, rootPath);

    if (!fs.existsSync(targetFile)) {
      throw new ValidationError(`File not found: '${input.path}'`);
    }

    const stats = fs.statSync(targetFile);
    if (!stats.isFile()) {
      throw new ValidationError(`Path is not a regular file: '${input.path}'`);
    }

    const totalBytes = stats.size;
    const maxBytes = input.maxBytes || 64 * 1024;
    const offset = input.offset || 0;

    const fd = fs.openSync(targetFile, 'r');
    const buffer = Buffer.alloc(Math.min(maxBytes, totalBytes - offset));
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, offset);
    fs.closeSync(fd);

    const content = buffer.toString('utf-8', 0, bytesRead);
    const truncated = offset + bytesRead < totalBytes;

    return {
      content,
      bytesRead,
      totalBytes,
      truncated,
    };
  },
};

/**
 * filesystem.write - Writes content to a workspace file.
 */
export const filesystemWriteTool: ITool<{ path: string; content: string; overwrite?: boolean }, { path: string; bytesWritten: number; created: boolean }> = {
  name: 'filesystem.write',
  description: 'Writes content to a file inside the permitted workspace.',
  version: '1.0.0',
  category: 'WRITE',
  riskLevel: 'MEDIUM',
  capabilities: ['filesystem.write'],
  permissions: [{ name: 'filesystem:write', action: 'WRITE', riskLevel: 'MEDIUM', description: 'Write file contents' }],
  inputSchema: z.object({
    path: z.string().min(1, 'File path is required'),
    content: z.string(),
    overwrite: z.boolean().optional().default(true),
  }),
  outputSchema: z.object({
    path: z.string(),
    bytesWritten: z.number(),
    created: z.boolean(),
  }),
  definition(): ToolDefinition {
    return {
      id: 'filesystem.write',
      name: this.name,
      description: this.description,
      version: this.version,
      category: this.category,
      riskLevel: this.riskLevel,
      capabilities: this.capabilities || [],
      permissions: this.permissions,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      supportsDryRun: true,
      supportsCancellation: false,
      status: 'AVAILABLE',
    };
  },
  execute: async (input, context) => {
    const rootPath = getRootPath(context);
    const targetFile = FilesystemSandbox.resolveSecurePath(input.path, rootPath);

    if (context.dryRun) {
      return {
        path: input.path,
        bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
        created: !fs.existsSync(targetFile),
      };
    }

    const dir = path.dirname(targetFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const exists = fs.existsSync(targetFile);
    if (exists && input.overwrite === false) {
      throw new ValidationError(`File already exists and overwrite is false: '${input.path}'`);
    }

    fs.writeFileSync(targetFile, input.content, 'utf-8');
    const bytesWritten = Buffer.byteLength(input.content, 'utf-8');

    return {
      path: input.path,
      bytesWritten,
      created: !exists,
    };
  },
};

/**
 * filesystem.create - Creates an empty file or directory.
 */
export const filesystemCreateTool: ITool<{ path: string; type?: 'FILE' | 'DIRECTORY' | 'file' | 'directory' }, { path: string; type: string; created: boolean }> = {
  name: 'filesystem.create',
  description: 'Creates a new empty file or directory in the workspace.',
  version: '1.0.0',
  category: 'WRITE',
  riskLevel: 'LOW',
  capabilities: ['filesystem.create', 'filesystem.write'],
  permissions: [{ name: 'filesystem:create', action: 'WRITE', riskLevel: 'LOW', description: 'Create file or directory' }],
  inputSchema: z.object({
    path: z.string().min(1, 'Path is required'),
    type: z.enum(['FILE', 'DIRECTORY', 'file', 'directory']).optional().transform(v => (v ? v.toUpperCase() as 'FILE' | 'DIRECTORY' : 'FILE')),
  }),
  outputSchema: z.object({
    path: z.string(),
    type: z.string(),
    created: z.boolean(),
  }),
  execute: async (input, context) => {
    const rootPath = getRootPath(context);
    const target = FilesystemSandbox.resolveSecurePath(input.path, rootPath);

    if (context.dryRun) {
      return { path: input.path, type: input.type || 'FILE', created: !fs.existsSync(target) };
    }

    if (input.type === 'DIRECTORY') {
      if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
        return { path: input.path, type: 'DIRECTORY', created: true };
      }
      return { path: input.path, type: 'DIRECTORY', created: false };
    } else {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(target)) {
        fs.writeFileSync(target, '', 'utf-8');
        return { path: input.path, type: 'FILE', created: true };
      }
      return { path: input.path, type: 'FILE', created: false };
    }
  },
};

/**
 * filesystem.delete - Deletes a file or directory inside the workspace.
 */
export const filesystemDeleteTool: ITool<{ path: string; recursive?: boolean }, { path: string; deleted: boolean; dryRun?: boolean }> = {
  name: 'filesystem.delete',
  description: 'Deletes a file or directory within the permitted workspace.',
  version: '1.0.0',
  category: 'DESTRUCTIVE',
  riskLevel: 'HIGH',
  capabilities: ['filesystem.delete'],
  supportsDryRun: true,
  permissions: [{ name: 'filesystem:delete', action: 'DESTRUCTIVE', riskLevel: 'HIGH', description: 'Delete file or directory' }],
  inputSchema: z.object({
    path: z.string().min(1, 'Path is required'),
    recursive: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({
    path: z.string(),
    deleted: z.boolean(),
    dryRun: z.boolean().optional(),
  }),
  execute: async (input, context) => {
    const rootPath = getRootPath(context);
    const target = FilesystemSandbox.resolveSecurePath(input.path, rootPath);

    if (!fs.existsSync(target)) {
      throw new ValidationError(`Target path not found for deletion: '${input.path}'`);
    }

    // Safety guard: cannot delete the workspace root itself without explicit protection
    if (target === path.resolve(rootPath)) {
      throw new SandboxViolationError(input.path, rootPath);
    }

    if (context.dryRun) {
      return { path: input.path, deleted: true, dryRun: true };
    }

    const stats = fs.statSync(target);
    if (stats.isDirectory()) {
      if (!input.recursive) {
        throw new ValidationError(`Path is a directory. Set recursive=true to delete: '${input.path}'`);
      }
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }

    return { path: input.path, deleted: true };
  },
};

/**
 * filesystem.move - Moves or renames a file or directory within the workspace.
 */
export const filesystemMoveTool: ITool<{ source: string; destination: string }, { source: string; destination: string; moved: boolean }> = {
  name: 'filesystem.move',
  description: 'Moves or renames a file/directory within the permitted workspace.',
  version: '1.0.0',
  category: 'WRITE',
  riskLevel: 'MEDIUM',
  capabilities: ['filesystem.move', 'filesystem.write'],
  permissions: [{ name: 'filesystem:move', action: 'WRITE', riskLevel: 'MEDIUM', description: 'Move file or directory' }],
  inputSchema: z.object({
    source: z.string().min(1, 'Source path is required'),
    destination: z.string().min(1, 'Destination path is required'),
  }),
  outputSchema: z.object({
    source: z.string(),
    destination: z.string(),
    moved: z.boolean(),
  }),
  execute: async (input, context) => {
    const rootPath = getRootPath(context);
    const src = FilesystemSandbox.resolveSecurePath(input.source, rootPath);
    const dest = FilesystemSandbox.resolveSecurePath(input.destination, rootPath);

    if (!fs.existsSync(src)) {
      throw new ValidationError(`Source path does not exist: '${input.source}'`);
    }

    if (context.dryRun) {
      return { source: input.source, destination: input.destination, moved: true };
    }

    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.renameSync(src, dest);
    return { source: input.source, destination: input.destination, moved: true };
  },
};

/**
 * filesystem.copy - Copies a file or directory within the workspace.
 */
export const filesystemCopyTool: ITool<{ source: string; destination: string }, { source: string; destination: string; copied: boolean }> = {
  name: 'filesystem.copy',
  description: 'Copies a file or directory within the permitted workspace.',
  version: '1.0.0',
  category: 'WRITE',
  riskLevel: 'LOW',
  capabilities: ['filesystem.copy', 'filesystem.write'],
  permissions: [{ name: 'filesystem:copy', action: 'WRITE', riskLevel: 'LOW', description: 'Copy file or directory' }],
  inputSchema: z.object({
    source: z.string().min(1, 'Source path is required'),
    destination: z.string().min(1, 'Destination path is required'),
  }),
  outputSchema: z.object({
    source: z.string(),
    destination: z.string(),
    copied: z.boolean(),
  }),
  execute: async (input, context) => {
    const rootPath = getRootPath(context);
    const src = FilesystemSandbox.resolveSecurePath(input.source, rootPath);
    const dest = FilesystemSandbox.resolveSecurePath(input.destination, rootPath);

    if (!fs.existsSync(src)) {
      throw new ValidationError(`Source path does not exist: '${input.source}'`);
    }

    if (context.dryRun) {
      return { source: input.source, destination: input.destination, copied: true };
    }

    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.cpSync(src, dest, { recursive: true });
    return { source: input.source, destination: input.destination, copied: true };
  },
};

/**
 * filesystem.search - Searches for files matching a pattern or content query.
 */
export const filesystemSearchTool: ITool<{ query: string; extension?: string; maxResults?: number }, { results: Array<{ path: string; matchType: 'NAME' | 'CONTENT' }> }> = {
  name: 'filesystem.search',
  description: 'Searches for files matching a name or content query within the workspace.',
  version: '1.0.0',
  category: 'READ',
  riskLevel: 'LOW',
  capabilities: ['filesystem.search', 'filesystem.read'],
  permissions: [{ name: 'filesystem:search', action: 'READ', riskLevel: 'LOW', description: 'Search workspace files' }],
  inputSchema: z.object({
    query: z.string().min(1, 'Search query is required'),
    extension: z.string().optional(),
    maxResults: z.number().optional().default(50),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      path: z.string(),
      matchType: z.enum(['NAME', 'CONTENT']),
    })),
  }),
  execute: async (input, context) => {
    const rootPath = getRootPath(context);
    const query = input.query.toLowerCase();
    const maxResults = input.maxResults || 50;
    const results: Array<{ path: string; matchType: 'NAME' | 'CONTENT' }> = [];

    function searchDir(currentDir: string): void {
      if (results.length >= maxResults) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;
        // Ignore node_modules, .git, dist
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;

        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (entry.isFile()) {
          if (input.extension && !entry.name.endsWith(input.extension)) continue;

          if (entry.name.toLowerCase().includes(query)) {
            results.push({ path: relPath, matchType: 'NAME' });
          } else {
            // Check text file content for short queries
            try {
              const stats = fs.statSync(fullPath);
              if (stats.size < 256 * 1024) { // Only search files < 256KB
                const text = fs.readFileSync(fullPath, 'utf-8');
                if (text.toLowerCase().includes(query)) {
                  results.push({ path: relPath, matchType: 'CONTENT' });
                }
              }
            } catch {
              // Ignore binary or unreadable files
            }
          }
        }
      }
    }

    searchDir(rootPath);
    return { results };
  },
};
