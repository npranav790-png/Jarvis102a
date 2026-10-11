import crypto from 'node:crypto';

export type EventType =
  | 'system:started'
  | 'system:shutdown'
  | 'project:created'
  | 'project:updated'
  | 'session:created'
  | 'session:closed'
  | 'task:created'
  | 'task:queued'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:cancelled'
  | 'task:retried'
  | 'security:approval_requested'
  | 'security:approval_granted'
  | 'security:approval_denied'
  | 'tool:registered'
  | 'tool:executed'
  | 'agent:registered'
  | 'agent:executed'
  | 'provider:registered'
  | 'provider:health_checked'
  | 'brain:request_started'
  | 'brain:request_completed'
  | 'brain:planning_started'
  | 'brain:planning_completed'
  | 'brain:replanning'
  | 'brain:verification_started'
  | 'brain:verification_completed'
  | 'memory:created'
  | 'memory:retrieved'
  | 'memory:updated'
  | 'memory:expired'
  | 'memory:deleted'
  | 'tool:requested'
  | 'tool:approval_required'
  | 'tool:started'
  | 'tool:completed'
  | 'tool:failed'
  | 'tool:timed_out'
  | 'tool:cancelled'
  | 'agent:selected'
  | 'agent:started'
  | 'agent:completed'
  | 'agent:failed'
  | 'approval:requested'
  | 'approval:granted'
  | 'approval:denied'
  | 'approval:expired'
  | 'mcp:registered'
  | 'mcp:connected'
  | 'mcp:disconnected'
  | 'mcp:error'
  | 'artifact:created'
  | 'workspace:lock_acquired'
  | 'workspace:lock_released'
  | 'runtime:started'
  | 'runtime:stopped'
  | 'runtime:degraded'
  | 'job:created'
  | 'job:queued'
  | 'job:started'
  | 'job:completed'
  | 'job:failed'
  | 'job:cancelled'
  | 'job:retrying'
  | 'job:recovered'
  | 'automation:created'
  | 'automation:started'
  | 'automation:completed'
  | 'automation:failed'
  | 'automation:disabled'
  | 'automation:loop_blocked'
  | 'reminder:created'
  | 'reminder:due'
  | 'reminder:delivered'
  | 'notification:created'
  | 'notification:delivered'
  | 'voice:session_started'
  | 'voice:session_ended'
  | 'voice:transcript_received'
  | 'voice:command_started'
  | 'voice:command_completed'
  | 'voice:error'
  | string;

export interface JarvisEvent<T = Record<string, unknown>> {
  id: string;
  type: EventType;
  source: string;
  timestamp: string;
  correlationId?: string;
  causationId?: string;
  taskId?: string;
  jobId?: string;
  sessionId?: string;
  payload: T;
}

export type EventHandler<T = Record<string, unknown>> = (event: JarvisEvent<T>) => Promise<void> | void;

export function createEvent<T = Record<string, unknown>>(
  type: EventType,
  source: string,
  payload: T,
  optionsOrCorrelationId?: string | {
    correlationId?: string;
    causationId?: string;
    taskId?: string;
    jobId?: string;
    sessionId?: string;
  }
): JarvisEvent<T> {
  const isString = typeof optionsOrCorrelationId === 'string';
  const correlationId = isString ? optionsOrCorrelationId : optionsOrCorrelationId?.correlationId;
  const causationId = !isString ? optionsOrCorrelationId?.causationId : undefined;
  const taskId = !isString ? optionsOrCorrelationId?.taskId : undefined;
  const jobId = !isString ? optionsOrCorrelationId?.jobId : undefined;
  const sessionId = !isString ? optionsOrCorrelationId?.sessionId : undefined;

  return {
    id: crypto.randomUUID(),
    type,
    source,
    timestamp: new Date().toISOString(),
    correlationId,
    causationId,
    taskId,
    jobId,
    sessionId,
    payload,
  };
}
