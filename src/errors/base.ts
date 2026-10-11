/**
 * JARVIS 2.0 Error Hierarchy
 * Standardized, traceable error classes across all subsystems.
 */

export interface JarvisErrorOptions {
  code: string;
  details?: Record<string, unknown>;
  innerError?: Error;
}

export class JarvisError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown>;
  public readonly innerError?: Error;
  public readonly timestamp: string;

  constructor(message: string, options: JarvisErrorOptions) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.details = options.details || {};
    this.innerError = options.innerError;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      innerError: this.innerError ? {
        name: this.innerError.name,
        message: this.innerError.message,
      } : undefined,
    };
  }
}

// Configuration Errors
export class ConfigurationError extends JarvisError {
  constructor(message: string, details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code: 'CONFIG_ERROR', details, innerError });
  }
}

export class ValidationError extends JarvisError {
  constructor(message: string, details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code: 'VALIDATION_ERROR', details, innerError });
  }
}

// Database Errors
export class DatabaseError extends JarvisError {
  constructor(message: string, details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code: 'DATABASE_ERROR', details, innerError });
  }
}

// Security Errors
export class SecurityError extends JarvisError {
  constructor(message: string, code: string = 'SECURITY_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code, details, innerError });
  }
}

export class PermissionDeniedError extends SecurityError {
  constructor(permission: string, reason?: string) {
    super(`Permission denied: '${permission}'. ${reason || ''}`.trim(), 'PERMISSION_DENIED', { permission, reason });
  }
}

export class ApprovalRejectedError extends SecurityError {
  constructor(actionName: string, reason?: string) {
    super(`Action '${actionName}' was rejected or denied approval. ${reason || ''}`.trim(), 'APPROVAL_REJECTED', { actionName, reason });
  }
}

// Project & Session Errors
export class ProjectError extends JarvisError {
  constructor(message: string, code: string = 'PROJECT_ERROR', details?: Record<string, unknown>) {
    super(message, { code, details });
  }
}

export class ProjectNotFoundError extends ProjectError {
  constructor(projectId: string) {
    super(`Project not found: '${projectId}'`, 'PROJECT_NOT_FOUND', { projectId });
  }
}

export class SessionError extends JarvisError {
  constructor(message: string, code: string = 'SESSION_ERROR', details?: Record<string, unknown>) {
    super(message, { code, details });
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: '${sessionId}'`, 'SESSION_NOT_FOUND', { sessionId });
  }
}

// Task Errors
export class TaskError extends JarvisError {
  constructor(message: string, code: string = 'TASK_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code, details, innerError });
  }
}

export class TaskNotFoundError extends TaskError {
  constructor(taskId: string) {
    super(`Task not found: '${taskId}'`, 'TASK_NOT_FOUND', { taskId });
  }
}

export class InvalidTaskStateTransitionError extends TaskError {
  constructor(taskId: string, fromState: string, toState: string) {
    super(
      `Cannot transition task '${taskId}' from state '${fromState}' to '${toState}'.`,
      'INVALID_STATE_TRANSITION',
      { taskId, fromState, toState }
    );
  }
}

export class TaskTimeoutError extends TaskError {
  constructor(taskId: string, timeoutMs: number) {
    super(`Task '${taskId}' timed out after ${timeoutMs}ms.`, 'TASK_TIMEOUT', { taskId, timeoutMs });
  }
}

// Tool Errors
export class ToolError extends JarvisError {
  constructor(message: string, code: string = 'TOOL_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code, details, innerError });
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(`Tool not found: '${toolName}'`, 'TOOL_NOT_FOUND', { toolName });
  }
}

export class ToolExecutionError extends ToolError {
  constructor(toolName: string, reason: string, innerError?: Error) {
    super(`Tool execution failed for '${toolName}': ${reason}`, 'TOOL_EXECUTION_FAILED', { toolName, reason }, innerError);
  }
}

export class ToolValidationError extends ToolError {
  constructor(toolName: string, reason: string, details?: Record<string, unknown>) {
    super(`Validation failed for tool '${toolName}': ${reason}`, 'TOOL_VALIDATION_ERROR', { toolName, ...details });
  }
}

export class ToolPermissionError extends ToolError {
  constructor(toolName: string, reason: string, details?: Record<string, unknown>) {
    super(`Permission denied for tool '${toolName}': ${reason}`, 'TOOL_PERMISSION_DENIED', { toolName, ...details });
  }
}

export class ToolTimeoutError extends ToolError {
  constructor(toolName: string, timeoutMs: number) {
    super(`Tool execution timed out for '${toolName}' after ${timeoutMs}ms.`, 'TOOL_TIMEOUT', { toolName, timeoutMs });
  }
}

export class SandboxViolationError extends ToolError {
  constructor(attemptedPath: string, rootPath: string) {
    super(
      `Filesystem sandbox violation: attempted access to '${attemptedPath}' is outside the permitted workspace root '${rootPath}'.`,
      'SANDBOX_VIOLATION',
      { attemptedPath, rootPath }
    );
  }
}

// Provider & Cost Errors
export class ProviderError extends JarvisError {
  constructor(message: string, code: string = 'PROVIDER_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code, details, innerError });
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(providerId: string) {
    super(`AI Provider not found: '${providerId}'`, 'PROVIDER_NOT_FOUND', { providerId });
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(providerId: string, reason?: string, innerError?: Error) {
    super(`AI Provider '${providerId}' is unavailable: ${reason || 'Unknown error'}`, 'PROVIDER_UNAVAILABLE', { providerId, reason }, innerError);
  }
}

export class CostLimitExceededError extends ProviderError {
  constructor(attemptedCost: number, limit: number) {
    super(
      `Zero-cost policy violation: attempted cost $${attemptedCost.toFixed(4)} exceeds allowed limit of $${limit.toFixed(4)}. Paid providers are disabled.`,
      'COST_LIMIT_EXCEEDED',
      { attemptedCost, limit }
    );
  }
}

// Agent Errors
export class AgentError extends JarvisError {
  constructor(message: string, code: string = 'AGENT_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code, details, innerError });
  }
}

export class AgentNotFoundError extends AgentError {
  constructor(agentId: string) {
    super(`Agent not found: '${agentId}'`, 'AGENT_NOT_FOUND', { agentId });
  }
}

export class AgentSelectionError extends AgentError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(`Failed to select agent: ${reason}`, 'AGENT_SELECTION_ERROR', details);
  }
}

export class AgentExecutionError extends AgentError {
  constructor(agentId: string, reason: string, innerError?: Error) {
    super(`Agent execution failed for '${agentId}': ${reason}`, 'AGENT_EXECUTION_FAILED', { agentId, reason }, innerError);
  }
}

export class AgentLoopLimitError extends AgentError {
  constructor(limitName: string, value: number, details?: Record<string, unknown>) {
    super(
      `Agent loop limit reached: ${limitName} = ${value}. Execution halted to prevent infinite loops.`,
      'AGENT_LOOP_LIMIT_EXCEEDED',
      { limitName, value, ...details }
    );
  }
}

// Approval Errors
export class ApprovalError extends JarvisError {
  constructor(message: string, code: string = 'APPROVAL_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code, details, innerError });
  }
}

export class ApprovalExpiredError extends ApprovalError {
  constructor(approvalId: string) {
    super(`Approval request '${approvalId}' has expired.`, 'APPROVAL_EXPIRED', { approvalId });
  }
}

// MCP Errors
export class MCPError extends JarvisError {
  constructor(message: string, code: string = 'MCP_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code, details, innerError });
  }
}

export class MCPServerNotFoundError extends MCPError {
  constructor(serverName: string) {
    super(`MCP server not found: '${serverName}'`, 'MCP_SERVER_NOT_FOUND', { serverName });
  }
}

export class MCPConnectionError extends MCPError {
  constructor(serverName: string, reason: string, innerError?: Error) {
    super(`Failed to connect to MCP server '${serverName}': ${reason}`, 'MCP_CONNECTION_ERROR', { serverName, reason }, innerError);
  }
}

// Resource & Concurrency Errors
export class ResourceLimitError extends JarvisError {
  constructor(resource: string, limit: number, current: number) {
    super(`Resource limit exceeded for '${resource}': current ${current} exceeds maximum ${limit}.`, {
      code: 'RESOURCE_LIMIT_EXCEEDED',
      details: { resource, limit, current },
    });
  }
}

export class WorkspaceLockError extends JarvisError {
  constructor(workspacePath: string, activeTaskId: string) {
    super(
      `Workspace lock conflict on '${workspacePath}': currently locked by task '${activeTaskId}'.`,
      {
        code: 'WORKSPACE_LOCKED',
        details: { workspacePath, activeTaskId },
      }
    );
  }
}

// Brain & Reasoning Errors
export class BrainError extends JarvisError {
  constructor(message: string, code: string = 'BRAIN_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, { code, details, innerError });
  }
}

export class PlanningError extends BrainError {
  constructor(message: string, code: string = 'PLANNING_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, code, details, innerError);
  }
}

export class PlanValidationError extends PlanningError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(`Plan validation failed: ${reason}`, 'PLAN_VALIDATION_ERROR', details);
  }
}

export class ReplanLimitExceededError extends PlanningError {
  constructor(maxReplans: number, details?: Record<string, unknown>) {
    super(`Maximum replanning limit of ${maxReplans} exceeded. Terminating loop to prevent infinite execution.`, 'REPLAN_LIMIT_EXCEEDED', { maxReplans, ...details });
  }
}

export class MemoryError extends BrainError {
  constructor(message: string, code: string = 'MEMORY_ERROR', details?: Record<string, unknown>, innerError?: Error) {
    super(message, code, details, innerError);
  }
}

export class MemoryNotFoundError extends MemoryError {
  constructor(memoryId: string) {
    super(`Memory record not found: '${memoryId}'`, 'MEMORY_NOT_FOUND', { memoryId });
  }
}

export class SensitiveDataDetectedError extends MemoryError {
  constructor(reason: string) {
    super(`Sensitive data or secret detected. Action blocked by security policy: ${reason}`, 'SENSITIVE_DATA_DETECTED', { reason });
  }
}

export class VerificationError extends BrainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VERIFICATION_ERROR', details);
  }
}

