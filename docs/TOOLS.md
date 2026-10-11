# JARVIS 2.0 — Tools Subsystem Specification

## Overview

The JARVIS 2.0 Tools Subsystem transitions the architecture from **Thinking** to **Acting**:
```
THINK → PLAN → ACT → OBSERVE → VERIFY → REPLAN
```

Every action in JARVIS is executed through a strictly sandboxed, auditable, permission-gated tool conforming to the standardized `ITool` interface.

---

## Tool Interface & Contract

Every tool implements `ITool<TInput, TOutput>`:

```typescript
export interface ITool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  version: string;
  category: ActionCategory; // READ | WRITE | EXECUTE | NETWORK | DESTRUCTIVE | SYSTEM
  riskLevel: RiskLevel;     // LOW | MEDIUM | HIGH | CRITICAL
  permissions: SecurityPermission[];
  capabilities?: string[];
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  status?: ToolStatus;      // AVAILABLE | DEGRADED | UNAVAILABLE | DISABLED

  definition?(): ToolDefinition;
  execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
}
```

Every tool execution invoked through `ToolRegistry.executeTool()` returns a structured `ToolResult`:

```typescript
export interface ToolResult<T = unknown> {
  callId: string;
  toolName: string;
  success: boolean;
  status: ToolExecutionStatus; // SUCCESS | FAILED | TIMED_OUT | CANCELLED
  output?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  evidence?: string;
  artifacts?: ToolArtifact[];
  durationMs: number;
  exitCode?: number;
}
```

---

## Built-in Tools

| Tool ID | Category | Risk Level | Description |
| :--- | :--- | :--- | :--- |
| `filesystem.list` | READ | LOW | Lists files and directories within permitted workspace |
| `filesystem.read` | READ | LOW | Reads text content safely with chunking / offset support |
| `filesystem.write` | WRITE | MEDIUM | Writes or updates file contents within workspace |
| `filesystem.create` | WRITE | LOW | Creates empty files or directories within workspace |
| `filesystem.delete` | DESTRUCTIVE | HIGH | Deletes a file or directory within permitted workspace |
| `filesystem.move` | WRITE | MEDIUM | Renames or moves a file/directory within workspace |
| `filesystem.copy` | WRITE | LOW | Copies files or directories within workspace |
| `filesystem.search` | READ | LOW | Scans directory tree for name matches or content queries |
| `shell.execute` | EXECUTE | HIGH | Executes subprocess commands with output limits, timeout, and secret redaction |
| `git.status` | READ | LOW | Reports working tree status and branch info |
| `git.diff` | READ | LOW | Reports unstaged or staged git diff |
| `git.log` | READ | LOW | Reports recent commit history |
| `git.branch` | READ | LOW | Lists local branches |
| `git.add` | WRITE | MEDIUM | Stages files for commit |
| `git.commit` | WRITE | MEDIUM | Commits staged changes |
| `process.start` | EXECUTE | HIGH | Starts a background process within permitted workspace |
| `process.status` | READ | LOW | Checks status of a background process by PID |
| `process.stop` | DESTRUCTIVE | MEDIUM | Terminates an active process by PID |
| `code.test` | EXECUTE | MEDIUM | Automatically detects test runner (`npm`, `pytest`, `cargo`, `go`) and executes tests |

---

## Execution Security Pipeline

Every tool call progresses through this mandatory pipeline:

```
Tool Request
  ↓
1. Validation Gate (Zod schema checking)
  ↓
2. Sandbox Gate (FilesystemSandbox.resolveSecurePath, canonicalization)
  ↓
3. Policy Gate (SecurityPolicy + ApprovalManager check)
  ↓
4. Interactive Approval Gate (if risk >= approvalThreshold)
  ↓
5. Execution (Subprocess spawn with filtered env & timeout)
  ↓
6. Secret Redaction (MemorySanitizer.redactSecrets on stdout/evidence)
  ↓
7. Artifact Recording (ArtifactManager tracking path & checksum)
  ↓
8. Audit Trail (ToolCallRepository + AuditRepository logging)
  ↓
Structured ToolResult
```
