import { TaskStatus } from './types.js';
import { InvalidTaskStateTransitionError } from '../errors/base.js';

export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  CREATED: ['QUEUED', 'CANCELLED'],
  QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['WAITING_APPROVAL', 'WAITING_CHILD', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'],
  WAITING_APPROVAL: ['RUNNING', 'CANCELLED'],
  WAITING_CHILD: ['RUNNING', 'CANCELLED'],
  COMPLETED: [],
  FAILED: ['QUEUED'], // Allow retry from FAILED
  CANCELLED: [],
  TIMED_OUT: ['QUEUED'], // Allow retry from TIMED_OUT
};

export function canTransition(current: TaskStatus, target: TaskStatus): boolean {
  const allowed = VALID_TRANSITIONS[current];
  return allowed ? allowed.includes(target) : false;
}

export function assertValidTransition(taskId: string, current: TaskStatus, target: TaskStatus): void {
  if (!canTransition(current, target)) {
    throw new InvalidTaskStateTransitionError(taskId, current, target);
  }
}
