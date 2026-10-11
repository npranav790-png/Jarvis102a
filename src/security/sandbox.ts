import path from 'node:path';
import fs from 'node:fs';
import { SandboxViolationError } from '../errors/base.js';

// Windows reserved device names
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export class FilesystemSandbox {
  /**
   * Validates that targetPath resides inside the allowed rootPath workspace.
   * Defends against:
   * - `..` path traversal
   * - Absolute path escapes outside root
   * - Symlink & junction point escapes
   * - Windows reserved device names (CON, NUL, COM1, etc.)
   * - Alternate Data Streams (file:stream)
   * - Null-byte injection
   *
   * Returns the canonical, validated path.
   */
  public static resolveSecurePath(targetPath: string, rootPath: string): string {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new SandboxViolationError(targetPath || '', rootPath);
    }

    // 1. Check for null byte injection
    if (targetPath.includes('\0')) {
      throw new SandboxViolationError(targetPath, rootPath);
    }

    // 2. Check for Alternate Data Streams on Windows (e.g. file.txt:stream)
    const normalizedParts = targetPath.replace(/\\/g, '/').split('/');
    for (const part of normalizedParts) {
      if (part.includes(':') && !part.match(/^[a-zA-Z]:$/)) {
        throw new SandboxViolationError(targetPath, rootPath);
      }
      // Check for Windows device names
      if (WINDOWS_RESERVED_NAMES.test(part)) {
        throw new SandboxViolationError(targetPath, rootPath);
      }
    }

    // 3. Resolve absolute paths
    const resolvedRoot = path.resolve(rootPath);
    const resolvedTarget = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(resolvedRoot, targetPath);

    // Normalize casing for Windows drive letters
    const canonicalRoot = FilesystemSandbox.normalizeDrive(resolvedRoot);
    const canonicalTarget = FilesystemSandbox.normalizeDrive(resolvedTarget);

    // 4. Ensure target starts with root path
    const isInside = canonicalTarget === canonicalRoot ||
      canonicalTarget.startsWith(canonicalRoot.endsWith(path.sep) ? canonicalRoot : canonicalRoot + path.sep);

    if (!isInside) {
      throw new SandboxViolationError(targetPath, rootPath);
    }

    // 5. If the target exists, verify symlink realpath does not escape
    try {
      if (fs.existsSync(resolvedTarget)) {
        const realTarget = FilesystemSandbox.normalizeDrive(fs.realpathSync(resolvedTarget));
        const realRoot = fs.existsSync(resolvedRoot)
          ? FilesystemSandbox.normalizeDrive(fs.realpathSync(resolvedRoot))
          : canonicalRoot;

        const isRealInside = realTarget === realRoot ||
          realTarget.startsWith(realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep);

        if (!isRealInside) {
          throw new SandboxViolationError(targetPath, rootPath);
        }
        return realTarget;
      }
    } catch (err) {
      // If realpath resolution errors due to sandbox violation
      if (err instanceof SandboxViolationError) throw err;
    }

    return canonicalTarget;
  }

  /**
   * Returns true if targetPath is safely within rootPath without throwing.
   */
  public static isWithinWorkspace(targetPath: string, rootPath: string): boolean {
    try {
      FilesystemSandbox.resolveSecurePath(targetPath, rootPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalizes drive letter casing for Windows paths (e.g. c:\ -> C:\).
   */
  private static normalizeDrive(p: string): string {
    if (process.platform === 'win32' && /^[a-zA-Z]:/.test(p)) {
      return p[0].toUpperCase() + p.slice(1);
    }
    return p;
  }

  /**
   * Sanitizes environment variables for tool/subprocess execution.
   * Strips sensitive API keys, tokens, and passwords unless explicitly allowlisted.
   */
  public static filterEnvironment(
    env: NodeJS.ProcessEnv = process.env,
    allowlist: string[] = ['PATH', 'PATHEXT', 'NODE_ENV', 'SYSTEMROOT', 'TEMP', 'TMP', 'USER', 'HOME', 'HOMEPATH', 'APPDATA']
  ): Record<string, string> {
    const safeEnv: Record<string, string> = {};
    const sensitiveKeywords = [
      'KEY',
      'SECRET',
      'PASSWORD',
      'TOKEN',
      'CREDENTIAL',
      'AUTH',
      'PRIVATE',
      'GROQ',
      'OPENROUTER',
      'HUGGINGFACE',
      'AWS',
      'GITHUB',
    ];

    for (const [key, value] of Object.entries(env)) {
      if (!value) continue;
      const upperKey = key.toUpperCase();

      // Check if explicitly allowlisted
      if (allowlist.some(a => a.toUpperCase() === upperKey)) {
        safeEnv[key] = value;
        continue;
      }

      // Check if key contains sensitive keywords
      const isSensitive = sensitiveKeywords.some(kw => upperKey.includes(kw));
      if (!isSensitive) {
        safeEnv[key] = value;
      }
    }

    return safeEnv;
  }
}
