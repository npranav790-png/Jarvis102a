import fs from 'node:fs';
import path from 'node:path';
import { ResearchResult, CodebaseFileContext } from './types.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('CodebaseResearcher');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.gradle',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.gemini',
  '.idea',
  '.vscode',
  'coverage',
]);

const MANIFEST_NAMES = [
  'package.json',
  'tsconfig.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle.kts',
  'build.gradle',
  'Makefile',
  'Dockerfile',
  'docker-compose.yml',
  'README.md',
];

export class CodebaseResearcher {
  /**
   * Researches the given workspace directory to extract architectural context,
   * tech stack details, manifests, and relevant source files.
   */
  public async research(workspaceRoot: string, userQuery: string): Promise<ResearchResult> {
    const resolvedRoot = path.resolve(workspaceRoot);
    logger.info(`Researching codebase at: ${resolvedRoot} for query: "${userQuery}"`);

    if (!fs.existsSync(resolvedRoot)) {
      throw new Error(`Workspace path does not exist: ${resolvedRoot}`);
    }

    const techStack: string[] = [];
    const manifestsFound: string[] = [];
    let dependencies: Record<string, string> = {};

    // 1. Inspect Root Manifests
    const packageJsonPath = path.join(resolvedRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      manifestsFound.push('package.json');
      techStack.push('Node.js');
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (dependencies.react) techStack.push('React');
        if (dependencies.typescript) techStack.push('TypeScript');
        if (dependencies.express) techStack.push('Express');
        if (dependencies.vite) techStack.push('Vite');
        if (dependencies.next) techStack.push('Next.js');
        if (dependencies.tailwindcss) techStack.push('Tailwind CSS');
        if (dependencies['@types/node']) techStack.push('TypeScript / Node');
      } catch (err: any) {
        logger.warn(`Failed to parse package.json: ${err.message}`);
      }
    }

    if (fs.existsSync(path.join(resolvedRoot, 'tsconfig.json'))) {
      manifestsFound.push('tsconfig.json');
      if (!techStack.includes('TypeScript')) techStack.push('TypeScript');
    }

    if (fs.existsSync(path.join(resolvedRoot, 'pyproject.toml')) || fs.existsSync(path.join(resolvedRoot, 'requirements.txt'))) {
      techStack.push('Python');
      manifestsFound.push('Python Config');
    }

    if (fs.existsSync(path.join(resolvedRoot, 'Cargo.toml'))) {
      techStack.push('Rust');
      manifestsFound.push('Cargo.toml');
    }

    if (fs.existsSync(path.join(resolvedRoot, 'go.mod'))) {
      techStack.push('Go');
      manifestsFound.push('go.mod');
    }

    // 2. Discover Tree and Relevant Source Files
    const allFiles: string[] = [];
    this.walkDirectory(resolvedRoot, resolvedRoot, allFiles, 4);

    const keywords = this.extractKeywords(userQuery);
    const relevantFiles: CodebaseFileContext[] = [];

    // Prioritize manifests and readme
    for (const manifest of MANIFEST_NAMES) {
      const fullPath = path.join(resolvedRoot, manifest);
      if (fs.existsSync(fullPath)) {
        relevantFiles.push({
          path: fullPath,
          relativePath: manifest,
          isKeyFile: true,
          summary: `Configuration file: ${manifest}`,
        });
      }
    }

    // Match files against keywords
    for (const relPath of allFiles) {
      if (relevantFiles.some((f) => f.relativePath === relPath)) continue;
      const lower = relPath.toLowerCase();
      const matchesKeyword = keywords.some((kw) => lower.includes(kw));

      if (matchesKeyword) {
        const fullPath = path.join(resolvedRoot, relPath);
        let lineCount: number | undefined;
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          lineCount = content.split('\n').length;
        } catch {
          // Ignore binary or unreadable files
        }

        relevantFiles.push({
          path: fullPath,
          relativePath: relPath,
          lineCount,
          isKeyFile: false,
        });

        if (relevantFiles.length >= 15) break;
      }
    }

    // Generate high-level directory structure summary
    const structureSummary = this.summarizeDirectoryStructure(resolvedRoot);

    return {
      projectRoot: resolvedRoot,
      techStack: techStack.length > 0 ? techStack : ['Generic Project'],
      manifests: manifestsFound,
      relevantFiles,
      projectStructureSummary: structureSummary,
      dependencies,
    };
  }

  private walkDirectory(currentDir: string, rootDir: string, outFiles: string[], maxDepth: number, currentDepth = 0): void {
    if (currentDepth > maxDepth || outFiles.length > 100) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        this.walkDirectory(fullPath, rootDir, outFiles, maxDepth, currentDepth + 1);
      } else if (entry.isFile()) {
        outFiles.push(relativePath);
      }
    }
  }

  private summarizeDirectoryStructure(rootDir: string): string {
    const lines: string[] = [];
    try {
      const topEntries = fs.readdirSync(rootDir, { withFileTypes: true });
      for (const entry of topEntries) {
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
        if (entry.isDirectory()) {
          lines.push(`📁 ${entry.name}/`);
          try {
            const subEntries = fs.readdirSync(path.join(rootDir, entry.name), { withFileTypes: true }).slice(0, 5);
            for (const sub of subEntries) {
              if (!sub.name.startsWith('.') && !IGNORED_DIRS.has(sub.name)) {
                lines.push(`   └── ${sub.isDirectory() ? '📁 ' + sub.name + '/' : sub.name}`);
              }
            }
          } catch {
            // Ignore
          }
        } else {
          lines.push(`📄 ${entry.name}`);
        }
      }
    } catch {
      return 'Structure unavailable';
    }
    return lines.slice(0, 20).join('\n');
  }

  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
      'is', 'are', 'was', 'were', 'it', 'this', 'that', 'please', 'jarvis', 'make', 'create',
      'build', 'add', 'implement', 'code', 'develop', 'new', 'update', 'fix',
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }
}
