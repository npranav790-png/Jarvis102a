import { Task, TaskType } from '../tasks/types.js';
import { Project } from '../projects/types.js';
import { Session } from '../sessions/types.js';
import { ToolResult } from '../tools/types.js';
import { ReasoningMode } from '../brain/types.js';
import { SecurityPermission } from '../security/types.js';

export type AgentHealth = 'READY' | 'BUSY' | 'DEGRADED' | 'DISABLED' | 'FAILED';

export interface AgentModelRequirements {
  minContextWindow?: number;
  supportsTools?: boolean;
  supportsStreaming?: boolean;
  supportsJsonOutput?: boolean;
}

export interface AgentStep {
  stepNumber: number;
  thought?: string;
  action: 'TOOL_CALL' | 'COMPLETED' | 'ASK_APPROVAL' | 'REPLAN';
  toolName?: string;
  toolInput?: unknown;
  toolResult?: ToolResult;
  evidence?: string;
}

export interface AgentExecutionContext {
  project?: Project;
  session?: Session;
  rootPath?: string;
  signal?: AbortSignal;
  maxSteps?: number;
  maxToolCalls?: number;
  reasoningMode?: ReasoningMode;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentExecutionResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  evidence?: string;
  steps?: AgentStep[];
  toolCallCount?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  supportedTaskTypes: TaskType[];
  requiredPermissions: SecurityPermission[];
  allowedTools: string[];
  preferredReasoningMode: ReasoningMode;
  enabled: boolean;
  modelRequirements: AgentModelRequirements;
  status: AgentHealth;
}

export interface AgentRequest {
  task: Task;
  context: AgentExecutionContext;
  allowedTools?: string[];
  parameters?: Record<string, unknown>;
}

export interface IAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly description: string;
  readonly capabilities: string[];
  readonly allowedTools: string[];
  readonly modelRequirements: AgentModelRequirements;

  // Optional Prompt 4 properties
  readonly supportedTaskTypes?: TaskType[];
  readonly preferredReasoningMode?: ReasoningMode;
  readonly status?: AgentHealth;
  readonly enabled?: boolean;

  definition?(): AgentDefinition;
  run(task: Task, context: AgentExecutionContext): Promise<AgentExecutionResult>;
}

