import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ITool, ToolDefinition, ToolExecutionContext } from '../types.js';
import { shellExecuteTool, ShellExecuteResult } from './shell.js';
import { FilesystemSandbox } from '../../security/sandbox.js';
import { ValidationError } from '../../errors/base.js';

export interface CodeTestResult {
  passed: boolean;
  totalTests?: number;
  passedCount?: number;
  failedCount?: number;
  durationMs: number;
  rawOutput: string;
  summary: string;
}

export const codeTestTool: ITool<{
  runner?: 'npm' | 'pytest' | 'cargo' | 'go' | 'auto';
  testPath?: string;
  timeoutMs?: number;
}, CodeTestResult> = {
  name: 'code.test',
  description: 'Executes automated tests for the workspace project and parses results.',
  version: '1.0.0',
  category: 'EXECUTE',
  riskLevel: 'MEDIUM',
  capabilities: ['code.test', 'shell.execute'],
  permissions: [{ name: 'code:test', action: 'EXECUTE', riskLevel: 'MEDIUM', description: 'Run project automated test suite' }],
  inputSchema: z.object({
    runner: z.enum(['npm', 'pytest', 'cargo', 'go', 'auto']).optional().default('auto'),
    testPath: z.string().optional(),
    timeoutMs: z.number().optional().default(60000), // 60s
  }),
  outputSchema: z.object({
    passed: z.boolean(),
    totalTests: z.number().optional(),
    passedCount: z.number().optional(),
    failedCount: z.number().optional(),
    durationMs: z.number(),
    rawOutput: z.string(),
    summary: z.string(),
  }),
  execute: async (input, context) => {
    const rootPath = context.rootPath || (context.project as any)?.rootPath || process.cwd();
    const resolvedRoot = FilesystemSandbox.resolveSecurePath('.', rootPath);

    // 1. Detect test runner if auto
    let runner = input.runner || 'auto';
    if (runner === 'auto') {
      if (fs.existsSync(path.join(resolvedRoot, 'package.json'))) {
        runner = 'npm';
      } else if (fs.existsSync(path.join(resolvedRoot, 'pytest.ini')) || fs.existsSync(path.join(resolvedRoot, 'setup.py')) || fs.existsSync(path.join(resolvedRoot, 'pyproject.toml'))) {
        runner = 'pytest';
      } else if (fs.existsSync(path.join(resolvedRoot, 'Cargo.toml'))) {
        runner = 'cargo';
      } else if (fs.existsSync(path.join(resolvedRoot, 'go.mod'))) {
        runner = 'go';
      } else {
        runner = 'npm'; // Default
      }
    }

    // 2. Formulate test command
    let command: string;
    switch (runner) {
      case 'npm':
        command = input.testPath ? `npm test -- ${input.testPath}` : 'npm test';
        break;
      case 'pytest':
        command = input.testPath ? `pytest ${input.testPath}` : 'pytest';
        break;
      case 'cargo':
        command = input.testPath ? `cargo test ${input.testPath}` : 'cargo test';
        break;
      case 'go':
        command = input.testPath ? `go test ${input.testPath}` : 'go test ./...';
        break;
      default:
        throw new ValidationError(`Unsupported test runner: ${runner}`);
    }

    // 3. Execute via safe shellExecuteTool
    const shellResult = await shellExecuteTool.execute(
      {
        command,
        workingDirectory: '.',
        timeoutMs: input.timeoutMs || 60000,
      },
      context
    ) as ShellExecuteResult;

    const fullOutput = `${shellResult.stdout}\n${shellResult.stderr}`.trim();
    const passed = shellResult.exitCode === 0;

    // 4. Parse pass/fail indicators
    let passedCount: number | undefined;
    let failedCount: number | undefined;

    const passMatch = fullOutput.match(/pass(?:ed)?\s*[:=]?\s*(\d+)/i) || fullOutput.match(/(\d+)\s+passed/i);
    const failMatch = fullOutput.match(/fail(?:ed)?\s*[:=]?\s*(\d+)/i) || fullOutput.match(/(\d+)\s+failed/i);

    if (passMatch) passedCount = parseInt(passMatch[1], 10);
    if (failMatch) failedCount = parseInt(failMatch[1], 10);

    const totalTests = (passedCount !== undefined || failedCount !== undefined)
      ? (passedCount || 0) + (failedCount || 0)
      : undefined;

    const summary = passed
      ? `Tests completed successfully. ${totalTests ? `Total: ${totalTests} (All Passed)` : 'Exit code: 0'}`
      : `Test suite failed with exit code ${shellResult.exitCode}. ${failedCount ? `${failedCount} tests failed.` : ''}`;

    return {
      passed,
      totalTests,
      passedCount,
      failedCount,
      durationMs: shellResult.durationMs,
      rawOutput: fullOutput,
      summary,
    };
  },
};
