import { AgentRegistry } from './registry.js';
import { AgentSelector } from './selector.js';
import { IAgent, AgentExecutionContext, AgentExecutionResult, AgentStep } from './types.js';
import { TaskManager } from '../tasks/manager.js';
import { Task } from '../tasks/types.js';
import { VerificationEngine } from '../brain/verification.js';
import { MemoryService } from '../brain/memory/memory-service.js';
import { ReplanManager } from '../brain/replan.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { AgentExecutionError, AgentLoopLimitError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('AgentExecutor');

export interface AgentExecutorConfig {
  agentRegistry: AgentRegistry;
  taskManager: TaskManager;
  agentSelector?: AgentSelector;
  verificationEngine?: VerificationEngine;
  memoryService?: MemoryService;
  replanManager?: ReplanManager;
  workspaceManager?: WorkspaceManager;
  eventBus?: EventBus;
  maxToolCalls?: number;
  maxAgentSteps?: number;
  maxRepeatedActions?: number;
}

export class AgentExecutor {
  private agentRegistry: AgentRegistry;
  private taskManager: TaskManager;
  private agentSelector: AgentSelector;
  private verificationEngine?: VerificationEngine;
  private memoryService?: MemoryService;
  private replanManager?: ReplanManager;
  private workspaceManager?: WorkspaceManager;
  private eventBus?: EventBus;

  private maxToolCalls: number;
  private maxAgentSteps: number;
  private maxRepeatedActions: number;

  constructor(config: AgentExecutorConfig) {
    this.agentRegistry = config.agentRegistry;
    this.taskManager = config.taskManager;
    this.agentSelector = config.agentSelector || new AgentSelector(this.agentRegistry);
    this.verificationEngine = config.verificationEngine;
    this.memoryService = config.memoryService;
    this.replanManager = config.replanManager;
    this.workspaceManager = config.workspaceManager;
    this.eventBus = config.eventBus;

    this.maxToolCalls = config.maxToolCalls || 20;
    this.maxAgentSteps = config.maxAgentSteps || 10;
    this.maxRepeatedActions = config.maxRepeatedActions || 3;
  }

  /**
   * Executes a task through the complete agent loop:
   * Select -> Lock -> Execute -> Observe -> Verify -> Memory -> Complete
   */
  public async executeTask(taskId: string, contextOverride: Partial<AgentExecutionContext> = {}): Promise<AgentExecutionResult> {
    const task = this.taskManager.getTask(taskId);
    logger.info(`AgentExecutor beginning execution for task: "${task.title}" [id=${task.id}]`);

    // 1. Select Agent
    const selection = this.agentSelector.selectForTask(task);
    const agent = selection.selectedAgent;

    if (this.eventBus) {
      await this.eventBus.emit(
        createEvent('agent:selected', 'AgentExecutor', {
          taskId: task.id,
          agentId: agent.id,
          reason: selection.reason,
        }, task.id)
      );
    }

    // 2. Transition task: CREATED -> QUEUED -> RUNNING
    if (task.status === 'CREATED') {
      this.taskManager.queueTask(task.id);
    }
    const currentStatus = this.taskManager.getTask(task.id).status;
    if (currentStatus === 'QUEUED') {
      this.taskManager.startTask(task.id);
    }

    // 3. Acquire Workspace Lock if rootPath or project specified
    const rootPath = contextOverride.rootPath || (task.projectId ? contextOverride.project?.rootPath : undefined) || process.cwd();
    let lockAcquired = false;

    if (this.workspaceManager) {
      try {
        this.workspaceManager.acquireLock(rootPath, task.id, agent.id);
        lockAcquired = true;
      } catch (lockErr) {
        logger.warn(`Could not acquire workspace lock on '${rootPath}':`, lockErr as Record<string, unknown>);
      }
    }

    if (this.eventBus) {
      await this.eventBus.emit(
        createEvent('agent:started', 'AgentExecutor', {
          taskId: task.id,
          agentId: agent.id,
          rootPath,
        }, task.id)
      );
    }

    const startTime = Date.now();
    let result: AgentExecutionResult;

    try {
      // 4. Run Agent
      const executionContext: AgentExecutionContext = {
        ...contextOverride,
        rootPath,
        maxSteps: this.maxAgentSteps,
        maxToolCalls: this.maxToolCalls,
      };

      result = await agent.run(task, executionContext);

      // Loop Guard: Check for repeated actions
      if (result.steps && result.steps.length > 0) {
        this.detectRepeatedActions(result.steps);
      }

      // 5. Submit Evidence to VerificationEngine if available
      if (this.verificationEngine && result.evidence) {
        const verification = await this.verificationEngine.verify({
          planId: task.metadata?.planId as string || `plan_${task.id}`,
          objective: task.title,
          criteria: [task.description || task.title],
          evidence: [result.evidence],
        });

        logger.info(`Verification result for task '${task.id}': ${verification.status}`);
        if (verification.status === 'FAILED') {
          result.success = false;
          result.error = `Verification failed: ${verification.reasoning}`;
        }
      }

      // 6. Record Working / Episodic Memory
      if (this.memoryService && result.evidence) {
        try {
          await this.memoryService.createMemory({
            type: 'EPISODIC',
            subject: `Task: ${task.title}`,
            predicate: result.success ? 'completed_with' : 'failed_with',
            content: result.evidence,
            importance: result.success ? 'NORMAL' : 'HIGH',
            projectId: task.projectId ?? undefined,
            sessionId: task.sessionId ?? undefined,
            source: agent.id,
          });
        } catch {
          // Non-blocking memory update
        }
      }

      // 7. Update Task Status in TaskManager
      if (result.success) {
        this.taskManager.completeTask(task.id, (result.output as any) || { evidence: result.evidence });
        if (this.eventBus) {
          await this.eventBus.emit(
            createEvent('agent:completed', 'AgentExecutor', {
              taskId: task.id,
              agentId: agent.id,
              durationMs: Date.now() - startTime,
            }, task.id)
          );
        }
      } else {
        this.taskManager.failTask(task.id, {
          code: 'AGENT_EXECUTION_FAILED',
          message: result.error || 'Agent execution failed',
        });
        if (this.eventBus) {
          await this.eventBus.emit(
            createEvent('agent:failed', 'AgentExecutor', {
              taskId: task.id,
              agentId: agent.id,
              error: result.error,
            }, task.id)
          );
        }
      }

      result.durationMs = Date.now() - startTime;
      return result;
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown agent execution failure';
      logger.error(`Agent execution failed for task '${task.id}':`, undefined, err);

      this.taskManager.failTask(task.id, {
        code: err.code || 'AGENT_ERROR',
        message: errorMsg,
      });

      if (this.eventBus) {
        await this.eventBus.emit(
          createEvent('agent:failed', 'AgentExecutor', {
            taskId: task.id,
            agentId: agent.id,
            error: errorMsg,
          }, task.id)
        );
      }

      return {
        success: false,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    } finally {
      // 8. Release Workspace Lock
      if (lockAcquired && this.workspaceManager) {
        try {
          this.workspaceManager.releaseLock(rootPath, task.id);
        } catch {
          // Ignore release errors
        }
      }
    }
  }

  /**
   * Detects if the agent is stuck in an infinite loop repeating the exact same action.
   */
  private detectRepeatedActions(steps: AgentStep[]): void {
    if (steps.length < this.maxRepeatedActions) return;

    let repeatCount = 1;
    for (let i = steps.length - 1; i > 0; i--) {
      const current = steps[i];
      const previous = steps[i - 1];

      if (current.action === previous.action && current.toolName === previous.toolName &&
          JSON.stringify(current.toolInput) === JSON.stringify(previous.toolInput)) {
        repeatCount++;
        if (repeatCount >= this.maxRepeatedActions) {
          throw new AgentLoopLimitError(
            'Repeated identical action',
            repeatCount,
            { toolName: current.toolName, toolInput: current.toolInput }
          );
        }
      } else {
        break;
      }
    }
  }
}
