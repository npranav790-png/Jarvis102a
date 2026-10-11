export type JobStatus = 'QUEUED' | 'DISPATCHED' | 'RUNNING' | 'WAITING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'RETRYING' | 'CANCELLED' | 'TIMED_OUT' | 'RECOVERED';
export type JobPriority = 1 | 2 | 3 | 4 | 5; // 1 = CRITICAL, 3 = NORMAL, 5 = BACKGROUND

export interface RuntimeJob {
  id: string;
  taskId?: string;
  automationId?: string;
  type: string;
  priority: JobPriority;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
  nextRetryAt?: string;
  recoveryPolicy: 'REQUEUE' | 'FAIL_SAFE' | 'RESUME' | 'REQUIRE_APPROVAL' | 'IGNORE';
}

export type AutomationTriggerType = 'TIME' | 'SCHEDULE' | 'EVENT' | 'MANUAL' | 'SYSTEM';

export interface AutomationTrigger {
  type: AutomationTriggerType;
  config: Record<string, unknown>;
}

export interface AutomationAction {
  type: string;
  payload: Record<string, unknown>;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  jobId?: string;
  status: 'STARTED' | 'COMPLETED' | 'FAILED' | 'LOOP_BLOCKED';
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export type NotificationType = 'TASK_COMPLETED' | 'TASK_FAILED' | 'APPROVAL_REQUIRED' | 'REMINDER_DUE' | 'AUTOMATION_FAILED' | 'AUTOMATION_COMPLETED' | 'SYSTEM_WARNING' | 'SYSTEM_ERROR' | 'RUNTIME_STATUS' | 'VOICE_ERROR';
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  metadata?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
  deliveredAt?: string;
}

export interface Reminder {
  id: string;
  jobId?: string;
  title: string;
  description: string;
  status: 'CREATED' | 'SCHEDULED' | 'DUE' | 'DELIVERED' | 'ACKNOWLEDGED' | 'CANCELLED' | 'MISSED';
  priority: NotificationPriority;
  timezone: string;
  scheduledAt: string;
  createdAt: string;
  deliveredAt?: string;
}

export type RuntimeState = 'STARTING' | 'RUNNING' | 'DEGRADED' | 'STOPPING' | 'STOPPED' | 'FAILED';

export interface RuntimeStatus {
  state: RuntimeState;
  uptime: number;
  activeJobs: number;
  queuedJobs: number;
  activeAutomations: number;
  pendingApprovals: number;
  voiceAvailable: boolean;
  schedulerRunning: boolean;
  workersHealthy: boolean;
  databaseHealthy: boolean;
}
