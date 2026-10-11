import { z } from 'zod';
import { ActionCategory, RiskLevel, SecurityPermission } from '../security/types.js';

export type ToolStatus = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'DISABLED';

export type ToolExecutionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'WAITING_APPROVAL';

export interface ToolArtifact {
  id?: string;
  name: string;
  type: string;
  path: string;
  checksum?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  callId?: string;
  taskId?: string;
  sessionId?: string;
  projectId?: string;
  rootPath?: string;
  actor?: string;
  dryRun?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  category: ActionCategory;
  riskLevel: RiskLevel;
  capabilities: string[];
  permissions: SecurityPermission[];
  inputSchema: z.ZodType<unknown>;
  outputSchema?: z.ZodType<unknown>;
  supportsDryRun: boolean;
  supportsCancellation: boolean;
  status: ToolStatus;
}

export interface ToolRequest<TInput = unknown> {
  callId: string;
  toolName: string;
  input: TInput;
  context: ToolExecutionContext;
  dryRun?: boolean;
  signal?: AbortSignal;
}

export interface ToolResult<TOutput = unknown> {
  callId: string;
  toolName: string;
  success: boolean;
  status: ToolExecutionStatus;
  output?: TOutput;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  evidence?: string;
  artifacts?: ToolArtifact[];
  durationMs: number;
  exitCode?: number;
  outputTruncated?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ITool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly category: ActionCategory;
  readonly riskLevel: RiskLevel;
  readonly permissions: SecurityPermission[];
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;

  // Optional Prompt 4 properties
  readonly id?: string;
  readonly capabilities?: string[];
  readonly supportsDryRun?: boolean;
  readonly supportsCancellation?: boolean;
  readonly status?: ToolStatus;

  definition?(): ToolDefinition;
  execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
}
