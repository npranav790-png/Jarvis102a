import { TaskManager } from '../tasks/manager.js';
import { Task } from '../tasks/types.js';
import { Plan } from './types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('TaskDecomposer');

export interface DecomposedPlanTasks {
  parentTask: Task;
  childTasks: Task[];
  stepToTaskId: Map<string, string>;
}

export class TaskDecomposer {
  constructor(private taskManager: TaskManager) {}

  /**
   * Decomposes a validated plan into a parent task and ordered child tasks
   * using the existing TaskManager parent-child hierarchy.
   */
  public decomposePlan(
    plan: Plan,
    options?: { projectId?: string | null; sessionId?: string | null; priority?: number }
  ): DecomposedPlanTasks {
    logger.info(`Decomposing plan '${plan.id}' into tasks in TaskManager...`);

    // 1. Create or retrieve parent task
    let parentTask: Task;
    if (plan.taskId) {
      parentTask = this.taskManager.getTask(plan.taskId);
    } else {
      parentTask = this.taskManager.createTask({
        title: `Plan: ${plan.objective}`,
        description: `Autonomous plan execution for ${plan.objective}`,
        type: 'PLANNING',
        projectId: options?.projectId ?? undefined,
        sessionId: options?.sessionId ?? undefined,
        priority: options?.priority ?? 6,
        metadata: {
          planId: plan.id,
          stepsCount: plan.steps.length,
          risks: plan.risks,
          assumptions: plan.assumptions,
        },
      });
      // Update plan's taskId reference
      plan.taskId = parentTask.id;
    }

    // 2. Create child tasks for each step
    const childTasks: Task[] = [];
    const stepToTaskId = new Map<string, string>();

    for (const step of plan.steps) {
      const child = this.taskManager.createTask({
        parentTaskId: parentTask.id,
        title: step.title,
        description: step.description,
        type: step.type,
        projectId: options?.projectId ?? undefined,
        sessionId: options?.sessionId ?? undefined,
        priority: options?.priority ?? 5,
        metadata: {
          planId: plan.id,
          stepId: step.id,
          stepIndex: step.stepIndex,
          dependencies: step.dependencies,
          expectedOutput: step.expectedOutput,
          successCriteria: step.successCriteria,
        },
      });

      stepToTaskId.set(step.id, child.id);
      childTasks.push(child);
    }

    logger.info(
      `Plan '${plan.id}' decomposed into Parent Task '${parentTask.id}' with ${childTasks.length} Child Tasks.`
    );

    return {
      parentTask,
      childTasks,
      stepToTaskId,
    };
  }
}
