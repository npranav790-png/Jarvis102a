import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ITool, ToolExecutionContext } from '../types.js';
import { shellExecuteTool } from './shell.js';
import { FilesystemSandbox } from '../../security/sandbox.js';
import { ValidationError } from '../../errors/base.js';

export interface CodeDiagnosticIssue {
  filePath: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface CodeDiagnoseResult {
  clean: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: CodeDiagnosticIssue[];
  rawOutput: string;
  summary: string;
}

export const codeDiagnoseInputSchema = z.object({
  runner: z.enum(['tsc', 'eslint', 'python', 'auto']).optional().default('auto'),
  filePath: z.string().optional(),
  timeoutMs: z.number().optional().default(60000),
});

export class CodeDiagnoseTool implements ITool<{
  runner?: 'tsc' | 'eslint' | 'python' | 'auto';
  filePath?: string;
  timeoutMs?: number;
}, CodeDiagnoseResult> {
  public readonly name = 'code.diagnose';
  public readonly description =
    'Runs static type checking and linter verification (TypeScript tsc, ESLint, Python mypy) to detect syntax, type, and semantic errors with exact file and line locations.';
  public readonly version = '1.0.0';
  public readonly category = 'EXECUTE' as const;
  public readonly riskLevel = 'MEDIUM' as const;
  public readonly permissions = [
    { name: 'code:diagnose', action: 'EXECUTE' as const, riskLevel: 'MEDIUM' as const, description: 'Run static analysis and type diagnostics' },
  ];
  public readonly inputSchema = codeDiagnoseInputSchema;

  public async execute(
    input: { runner?: 'tsc' | 'eslint' | 'python' | 'auto'; filePath?: string; timeoutMs?: number },
    context?: ToolExecutionContext
  ): Promise<CodeDiagnoseResult> {
    const rootPath = context?.rootPath || (context as any)?.project?.rootPath || process.cwd();
    const resolvedRoot = FilesystemSandbox.resolveSecurePath('.', rootPath);

    // 1. Detect runner
    let runner = input.runner || 'auto';
    if (runner === 'auto') {
      if (fs.existsSync(path.join(resolvedRoot, 'tsconfig.json'))) {
        runner = 'tsc';
      } else if (fs.existsSync(path.join(resolvedRoot, 'pyproject.toml')) || fs.existsSync(path.join(resolvedRoot, 'setup.py'))) {
        runner = 'python';
      } else {
        runner = 'tsc';
      }
    }

    // 2. Formulate diagnostic command
    let command: string;
    switch (runner) {
      case 'tsc':
        command = 'npx tsc --noEmit';
        break;
      case 'eslint':
        command = input.filePath ? `npx eslint ${input.filePath}` : 'npx eslint .';
        break;
      case 'python':
        command = input.filePath ? `python -m py_compile ${input.filePath}` : 'python -m py_compile **/*.py';
        break;
      default:
        throw new ValidationError(`Unsupported diagnostic runner: ${runner}`);
    }

    // 3. Execute via safe shellExecuteTool
    const shellResult = await shellExecuteTool.execute(
      {
        command,
        workingDirectory: '.',
        timeoutMs: input.timeoutMs || 60000,
      },
      context || { actor: 'system' }
    );


    const rawOutput = `${shellResult.stdout}\n${shellResult.stderr}`.trim();
    const diagnostics: CodeDiagnosticIssue[] = [];

    // Parse TypeScript diagnostics (e.g., "src/foo.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.")
    // or "src/foo.ts:12:5 - error TS2322: ..."
    const tsRegex1 = /([a-zA-Z0-9_\-\.\/]+)\((\d+),(\d+)\):\s*(error|warning)\s+([A-Z0-9]+):\s*(.+)/g;
    const tsRegex2 = /([a-zA-Z0-9_\-\.\/]+):(\d+):(\d+)\s*-\s*(error|warning)\s+([A-Z0-9]+):\s*(.+)/g;

    let match: RegExpExecArray | null;
    while ((match = tsRegex1.exec(rawOutput)) !== null) {
      diagnostics.push({
        filePath: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        severity: match[4].toLowerCase() as 'error' | 'warning',
        code: match[5],
        message: match[6].trim(),
      });
    }

    while ((match = tsRegex2.exec(rawOutput)) !== null) {
      diagnostics.push({
        filePath: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        severity: match[4].toLowerCase() as 'error' | 'warning',
        code: match[5],
        message: match[6].trim(),
      });
    }

    const errorCount = diagnostics.filter(d => d.severity === 'error').length;
    const warningCount = diagnostics.filter(d => d.severity === 'warning').length;
    const clean = shellResult.exitCode === 0 && errorCount === 0;

    let summary = clean
      ? 'Static typecheck passed cleanly with 0 errors.'
      : `Static typecheck found ${errorCount} error(s) and ${warningCount} warning(s).`;

    if (errorCount > 0) {
      const topErrors = diagnostics.slice(0, 3).map(d => `${d.filePath}:${d.line} [${d.code}] ${d.message}`);
      summary += ` Top issues: ${topErrors.join('; ')}`;
    }

    return {
      clean,
      errorCount,
      warningCount,
      diagnostics,
      rawOutput,
      summary,
    };
  }
}

export const codeDiagnoseTool = new CodeDiagnoseTool();

