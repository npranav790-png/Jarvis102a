export type TaskStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'WAITING_CHILD'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT';

export type TaskType =
  | 'GENERAL'
  | 'PLANNING'
  | 'CODING'
  | 'RESEARCH'
  | 'EXECUTION'
  | 'AUTOMATION';

export interface Task<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
  id: string;
  parentTaskId: string | null;
  sessionId: string | null;
  projectId: string | null;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  input: TInput;
  output: TOutput | null;
  error: { code: string; message: string; details?: unknown } | null;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface CreateTaskInput<TInput = Record<string, unknown>> {
  title: string;
  description?: string;
  type?: TaskType;
  priority?: number;
  input?: TInput;
  parentTaskId?: string;
  sessionId?: string;
  projectId?: string;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskFilter {
  projectId?: string;
  sessionId?: string;
  status?: TaskStatus;
}
