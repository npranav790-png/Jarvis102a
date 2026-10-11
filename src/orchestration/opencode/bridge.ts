import { spawn, execFile, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { OpenCodeEngine, OpenCodeBridgeStatus, ExecutionLogChunk, SolutionDiff } from './types.js';
import { rootLogger } from '../../logging/logger.js';

const execFileAsync = promisify(execFile);
const logger = rootLogger.child('OpenCodeBridge');

export class OpenCodeBridge {
  private activeProcesses = new Map<string, { pid: number; kill: () => void }>();

  /**
   * Detects installed OpenCode and Kilo Code CLI binaries on the host system.
   */
  public async getStatus(): Promise<OpenCodeBridgeStatus> {
    const opencodeInfo = await this.detectBinary('opencode');
    const kiloInfo = await this.detectBinary('kilo');

    const defaultEngine: OpenCodeEngine = opencodeInfo.installed ? 'opencode' : (kiloInfo.installed ? 'kilo' : 'opencode');

    return {
      opencodeInstalled: opencodeInfo.installed,
      opencodePath: opencodeInfo.path,
      opencodeVersion: opencodeInfo.version,
      kiloInstalled: kiloInfo.installed,
      kiloPath: kiloInfo.path,
      kiloVersion: kiloInfo.version,
      defaultEngine,
      activeJobsCount: this.activeProcesses.size,
      supportedModels: [
        'default',
        'kilo/kilo-auto/free',
        'kilo/google/gemini-2.5-flash',
        'kilo/deepseek/deepseek-chat',
        'kilo/qwen/qwen3.5-35b-a3b',
      ],
    };
  }

  /**
   * Dispatches an engineered prompt to OpenCode or Kilo Code CLI inside the target project workspace.
   * Streams execution output chunks in real-time.
   */
  public async dispatch(params: {
    jobId: string;
    engine: OpenCodeEngine;
    workspaceRoot: string;
    prompt: string;
    model?: string;
    autoApprove?: boolean;
    onLogChunk: (chunk: ExecutionLogChunk) => void;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; diff: SolutionDiff; modifiedFiles: string[] }> {
    const { jobId, engine, workspaceRoot, prompt, model, autoApprove = true, onLogChunk, abortSignal } = params;

    const binaryInfo = await this.detectBinary(engine);
    if (!binaryInfo.installed || !binaryInfo.path) {
      throw new Error(
        `Coding engine '${engine}' is not installed or accessible on PATH. Please ensure ${engine} is installed.`
      );
    }

    const resolvedCwd = path.resolve(workspaceRoot);
    if (!fs.existsSync(resolvedCwd)) {
      throw new Error(`Target workspace directory does not exist: ${resolvedCwd}`);
    }

    logger.info(`Dispatching job ${jobId} to ${engine} in ${resolvedCwd}`);

    // Build CLI arguments
    const args: string[] = ['run'];
    if (autoApprove) {
      args.push('--auto');
    }

    // Determine model
    let targetModel = model;
    if (!targetModel || targetModel === 'default') {
      if (engine === 'kilo') {
        targetModel = 'kilo/kilo-auto/free';
      } else if (/qwen/i.test(prompt)) {
        targetModel = 'ollama/qwen3.5:8b';
      } else {
        // OpenCode uses its default built-in model (Muse Spark 1.3 Free)
        targetModel = undefined;
      }
    } else if (targetModel === 'qwen' || /qwen/i.test(targetModel)) {
      targetModel = 'ollama/qwen3.5:8b';
    }

    if (targetModel && targetModel !== 'default') {
      args.push('--model', targetModel);
    }

    // For single-line short prompts, also include as positional arg if under 400 chars without quotes
    const isShortCleanPrompt = prompt.length < 400 && !prompt.includes('\n') && !prompt.includes('"');
    if (isShortCleanPrompt) {
      args.push(prompt);
    }

    // On Windows, launch the real external terminal window so the operator can see OpenCode running live!
    if (process.platform === 'win32') {
      return this.dispatchInRealTerminal({
        jobId,
        engine,
        workspaceRoot: resolvedCwd,
        binaryPath: binaryInfo.path!,
        prompt,
        targetModel,
        autoApprove,
        onLogChunk,
        abortSignal,
      });
    }

    return new Promise((resolve, reject) => {
      onLogChunk({
        timestamp: new Date().toISOString(),
        stream: 'system',
        chunk: `[JARVIS Bridge] Launching ${engine.toUpperCase()} CLI in ${resolvedCwd}...\nModel: ${targetModel || 'Default'}\nExecutable: ${binaryInfo.path}\nArguments: ${args.join(' ')}\n------------------------------------------------------------\n`,
      });

      const binaryPath = binaryInfo.path!;
      const child: ChildProcess = spawn(binaryPath, args, {
        cwd: resolvedCwd,
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
          GOOGLE_API_KEY: process.env.GEMINI_API_KEY || '',
          GOOGLE_GENERATIVE_AI_API_KEY: process.env.GEMINI_API_KEY || '',
          GROQ_API_KEY: process.env.GROQ_API_KEY || '',
          CI: '1',
          FORCE_COLOR: '0',
        },
      });

      // Write prompt to stdin safely
      if (child.stdin) {
        child.stdin.on('error', () => {});
        try {
          child.stdin.write(prompt + '\n');
          child.stdin.end();
        } catch {
          // Ignored if child already exited
        }
      }

      const killProcess = () => {
        try {
          if (process.platform === 'win32' && child.pid) {
            execFile('taskkill', ['/pid', child.pid.toString(), '/T', '/F'], () => {});
          } else {
            child.kill('SIGTERM');
          }
        } catch {
          // Ignore
        }
      };

      if (child.pid) {
        this.activeProcesses.set(jobId, { pid: child.pid, kill: killProcess });
      }

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          onLogChunk({
            timestamp: new Date().toISOString(),
            stream: 'system',
            chunk: `\n[JARVIS Bridge] Abort requested by user. Terminating ${engine.toUpperCase()}...\n`,
          });
          killProcess();
        });
      }

      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          const text = data.toString('utf8');
          onLogChunk({
            timestamp: new Date().toISOString(),
            stream: 'stdout',
            chunk: text,
          });
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          const text = data.toString('utf8');
          onLogChunk({
            timestamp: new Date().toISOString(),
            stream: 'stderr',
            chunk: text,
          });
        });
      }

      child.on('error', (err: Error) => {
        this.activeProcesses.delete(jobId);
        onLogChunk({
          timestamp: new Date().toISOString(),
          stream: 'system',
          chunk: `\n[JARVIS Bridge] Error spawning process: ${err.message}\n`,
        });
        reject(err);
      });

      child.on('close', async (code: number | null) => {
        this.activeProcesses.delete(jobId);
        const exitCode = code ?? 0;

        onLogChunk({
          timestamp: new Date().toISOString(),
          stream: 'system',
          chunk: `\n------------------------------------------------------------\n[JARVIS Bridge] ${engine.toUpperCase()} process finished with exit code ${exitCode}.\nCollecting workspace diff...\n`,
        });

        try {
          const diff = await this.getGitDiff(resolvedCwd);
          resolve({
            exitCode,
            diff,
            modifiedFiles: diff.filesChanged,
          });
        } catch (err: any) {
          logger.warn(`Could not collect git diff: ${err.message}`);
          resolve({
            exitCode,
            diff: { gitDiff: '', filesChanged: [], insertions: 0, deletions: 0 },
            modifiedFiles: [],
          });
        }
      });
    });
  }

  /**
   * Launches a real, external Windows Terminal (PowerShell) window visible on the operator's desktop.
   * Simultaneously tees output to a log file so the web UI receives live streaming chunks.
   */
  private async dispatchInRealTerminal(params: {
    jobId: string;
    engine: OpenCodeEngine;
    workspaceRoot: string;
    binaryPath: string;
    prompt: string;
    targetModel?: string;
    autoApprove: boolean;
    onLogChunk: (chunk: ExecutionLogChunk) => void;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; diff: SolutionDiff; modifiedFiles: string[] }> {
    const {
      jobId,
      engine,
      workspaceRoot,
      binaryPath,
      prompt,
      targetModel,
      autoApprove,
      onLogChunk,
      abortSignal,
    } = params;

    const jobsDir = path.resolve(process.cwd(), 'data', 'terminal_jobs', jobId);
    fs.mkdirSync(jobsDir, { recursive: true });

    const promptFile = path.join(jobsDir, 'prompt.txt');
    const scriptFile = path.join(jobsDir, 'run.ps1');
    const logFile = path.join(jobsDir, 'output.log');
    const statusFile = path.join(jobsDir, 'status.txt');

    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile);

    // Write prompt text
    fs.writeFileSync(promptFile, prompt, 'utf8');

    // Clean prompt for argument passing
    const cleanPrompt = prompt.replace(/"/g, '`"').replace(/'/g, "''");
    fs.writeFileSync(promptFile, prompt, 'utf8');

    // Build the direct interactive CLI command:
    // For OpenCode, launch the authentic OpenCode TUI with --prompt and --auto (OpenCode does not use --model flag on root CLI)
    let cliCommand: string;
    if (engine === 'opencode') {
      const autoArg = autoApprove ? '--auto' : '';
      if (prompt.trim()) {
        cliCommand = `$promptText = (Get-Content -Raw -LiteralPath "${promptFile.replace(/\\/g, '\\\\')}").Trim()
if ($promptText) {
    & "${binaryPath.replace(/\\/g, '\\\\')}" --prompt $promptText ${autoArg}
} else {
    & "${binaryPath.replace(/\\/g, '\\\\')}" ${autoArg}
}`;
      } else {
        cliCommand = `& "${binaryPath.replace(/\\/g, '\\\\')}" ${autoArg}`.trim();
      }
    } else {
      const modelArg = targetModel ? `--model '${targetModel}'` : `--model 'kilo/kilo-auto/free'`;
      const autoArg = autoApprove ? '--auto' : '';
      cliCommand = `$promptText = (Get-Content -Raw -LiteralPath "${promptFile.replace(/\\/g, '\\\\')}").Trim()
& "${binaryPath.replace(/\\/g, '\\\\')}" run ${autoArg} ${modelArg} $promptText`;
    }

    // PowerShell script: Clean screen and immediately open the authentic OpenCode interactive TUI
    const psScript = `
try { [Console]::Title = "OpenCode - ${path.basename(workspaceRoot)}" } catch {}
Set-Location -LiteralPath "${workspaceRoot.replace(/\\/g, '\\\\')}"
$env:PATH = "C:\\Users\\TUF\\AppData\\Roaming\\npm;C:\\Program Files\\nodejs;" + $env:PATH
Clear-Host
${cliCommand}
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 0 }
Set-Content -LiteralPath "${statusFile.replace(/\\/g, '\\\\')}" -Value "$code"
`;

    fs.writeFileSync(scriptFile, psScript, 'utf8');

    onLogChunk({
      timestamp: new Date().toISOString(),
      stream: 'system',
      chunk: `[JARVIS Bridge] Launching interactive OpenCode terminal in ${workspaceRoot}...\n`,
    });

    return new Promise((resolve) => {
      // Launch external visible PowerShell window
      const launchProc = spawn('cmd.exe', [
        '/c',
        'start',
        '""',
        'powershell.exe',
        '-NoExit',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptFile,
      ], {
        windowsHide: false,
        detached: true,
        stdio: 'ignore',
      });
      launchProc.unref();

      let finished = false;
      let lastSize = 0;

      const cleanupAndResolve = async (exitCode: number) => {
        if (finished) return;
        finished = true;
        clearInterval(pollInterval);
        this.activeProcesses.delete(jobId);

        onLogChunk({
          timestamp: new Date().toISOString(),
          stream: 'system',
          chunk: `\n------------------------------------------------------------\n[JARVIS Bridge] Real terminal session finished with exit code ${exitCode}.\nCollecting workspace diff...\n`,
        });

        try {
          const diff = await this.getGitDiff(workspaceRoot);
          resolve({
            exitCode,
            diff,
            modifiedFiles: diff.filesChanged,
          });
        } catch (err: any) {
          logger.warn(`Could not collect git diff: ${err.message}`);
          resolve({
            exitCode,
            diff: { gitDiff: '', filesChanged: [], insertions: 0, deletions: 0 },
            modifiedFiles: [],
          });
        }
      };

      // Register cancellation handler
      this.activeProcesses.set(jobId, {
        pid: 0,
        kill: () => {
          onLogChunk({
            timestamp: new Date().toISOString(),
            stream: 'system',
            chunk: `\n[JARVIS Bridge] Job cancelled by user.\n`,
          });
          cleanupAndResolve(-1);
        },
      });

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          onLogChunk({
            timestamp: new Date().toISOString(),
            stream: 'system',
            chunk: `\n[JARVIS Bridge] Abort signal received.\n`,
          });
          cleanupAndResolve(-1);
        });
      }

      // Poll output.log and status.txt
      const pollInterval = setInterval(() => {
        if (finished) return;

        // 1. Read streamed log output
        if (fs.existsSync(logFile)) {
          try {
            const fullBuffer = fs.readFileSync(logFile);
            if (fullBuffer.length > lastSize) {
              const buffer = fullBuffer.subarray(lastSize);
              lastSize = fullBuffer.length;

              let text = '';
              if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
                text = buffer.subarray(2).toString('utf16le');
              } else if (buffer.includes(0x00)) {
                text = buffer.toString('utf16le');
              } else {
                text = buffer.toString('utf8');
              }

              if (text) {
                onLogChunk({
                  timestamp: new Date().toISOString(),
                  stream: 'stdout',
                  chunk: text,
                });
              }
            }
          } catch {
            // Best effort file read while being written
          }
        }

        // 2. Check for completion status
        if (fs.existsSync(statusFile)) {
          try {
            const content = fs.readFileSync(statusFile, 'utf8').trim();
            if (content.length > 0) {
              const code = parseInt(content, 10);
              const exitCode = isNaN(code) ? 0 : code;
              cleanupAndResolve(exitCode);
            }
          } catch {
            // Still writing status file
          }
        }
      }, 150);
    });
  }

  /**
   * Cancels a currently running orchestration job process.
   */
  public cancelJob(jobId: string): boolean {
    const active = this.activeProcesses.get(jobId);
    if (active) {
      active.kill();
      this.activeProcesses.delete(jobId);
      return true;
    }
    return false;
  }

  /**
   * Captures git status and git diff for the modified workspace.
   */
  public async getGitDiff(workspaceRoot: string): Promise<SolutionDiff> {
    try {
      const { stdout: diffOutput } = await execFileAsync('git', ['diff'], { cwd: workspaceRoot });
      const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], { cwd: workspaceRoot });

      const filesChanged: string[] = [];
      const lines = statusOutput.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          const parts = trimmed.split(/\s+/);
          if (parts[1]) filesChanged.push(parts[1]);
        }
      }

      let insertions = 0;
      let deletions = 0;
      const diffLines = diffOutput.split('\n');
      for (const l of diffLines) {
        if (l.startsWith('+') && !l.startsWith('+++')) insertions++;
        if (l.startsWith('-') && !l.startsWith('---')) deletions++;
      }

      return {
        gitDiff: diffOutput.slice(0, 100000), // Cap diff to 100KB for UI performance
        filesChanged,
        insertions,
        deletions,
      };
    } catch {
      return {
        gitDiff: '',
        filesChanged: [],
        insertions: 0,
        deletions: 0,
      };
    }
  }

  private async detectBinary(binaryName: OpenCodeEngine): Promise<{ installed: boolean; path?: string; version?: string }> {
    // 1. Check direct env overrides
    const envVar = binaryName === 'opencode' ? process.env.OPENCODE_BIN_PATH : process.env.KILO_BIN_PATH;
    if (envVar && fs.existsSync(envVar)) {
      return { installed: true, path: envVar, version: await this.getVersion(envVar) };
    }

    // 2. Check standard Windows AppData npm paths
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
      const candidateCmd = path.join(appData, 'npm', `${binaryName}.cmd`);
      if (fs.existsSync(candidateCmd)) {
        return { installed: true, path: candidateCmd, version: await this.getVersion(candidateCmd) };
      }
    }

    // 3. Fallback: Lookup on system PATH
    try {
      const tool = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(tool, [binaryName]);
      const firstLine = stdout.split('\n')[0]?.trim();
      if (firstLine && fs.existsSync(firstLine)) {
        return { installed: true, path: firstLine, version: await this.getVersion(firstLine) };
      }
    } catch {
      // Not in path
    }

    return { installed: false };
  }

  private async getVersion(binaryPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(binaryPath, ['--version'], { 
        shell: process.platform === 'win32', 
        timeout: 5000 
      });
      return stdout.trim().replace(/^v/, '');
    } catch {
      return 'installed';
    }
  }
}
