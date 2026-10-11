import crypto from 'node:crypto';
import path from 'node:path';
import {
  OrchestrationJob,
  OrchestrationOrder,
  OpenCodeBridgeStatus,
  ExecutionLogChunk,
} from './types.js';
import { CodebaseResearcher } from './researcher.js';
import { SpecPromptEngine } from './prompt-engineer.js';
import { OpenCodeBridge } from './bridge.js';
import { AIService } from '../../providers/ai-service.js';
import { ApprovalManager } from '../../security/approval-manager.js';
import { EventBus } from '../../events/bus.js';
import { createEvent } from '../../events/types.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('OpenCodeOrchestrator');

export class OpenCodeOrchestrator {
  private jobs = new Map<string, OrchestrationJob>();
  private researcher: CodebaseResearcher;
  private promptEngineer: SpecPromptEngine;
  private bridge: OpenCodeBridge;
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private aiService?: AIService,
    private approvalManager?: ApprovalManager,
    private eventBus?: EventBus
  ) {
    this.researcher = new CodebaseResearcher();
    this.promptEngineer = new SpecPromptEngine(this.aiService);
    this.bridge = new OpenCodeBridge();
  }

  public async getStatus(): Promise<OpenCodeBridgeStatus> {
    const bridgeStatus = await this.bridge.getStatus();
    return {
      ...bridgeStatus,
      activeJobsCount: Array.from(this.jobs.values()).filter(
        (j) => j.status === 'DEVELOPING' || j.status === 'ANALYZING'
      ).length,
    };
  }

  public listJobs(): OrchestrationJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getJob(id: string): OrchestrationJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Primary entry point: Takes a user order, researches the codebase,
   * brainstorms the architecture, engineers the prompt, and submits for human approval.
   */
  public async submitOrder(order: OrchestrationOrder): Promise<OrchestrationJob> {
    const jobId = `orch_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const targetWorkspace = path.resolve(order.targetWorkspace || process.cwd());
    const engine = order.engine || 'opencode';

    const initialLogChunk: ExecutionLogChunk = {
      timestamp: now,
      stream: 'system',
      chunk: `[JARVIS ORCHESTRATOR] Initialized task: "${order.orderText}"\n[JARVIS] Target Workspace: ${targetWorkspace}\n[JARVIS] Coding Engine: ${engine.toUpperCase()} (${order.model || 'Default Model'})\n[STAGE 1] Scanning project structure & repository manifests...\n`,
    };

    const job: OrchestrationJob = {
      id: jobId,
      status: 'ANALYZING',
      order: {
        ...order,
        targetWorkspace,
        engine,
      },
      engine,
      approvalStatus: 'NOT_SUBMITTED',
      executionLogs: [initialLogChunk],
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(jobId, job);
    this.emitEvent('orchestrator:created', { jobId, status: job.status });
    this.emitEvent('orchestrator:log', { jobId, chunk: initialLogChunk });

    try {
      // 1. Codebase Research
      const research = await this.researcher.research(targetWorkspace, order.orderText);
      job.research = research;
      job.status = 'BRAINSTORMING';
      job.updatedAt = new Date().toISOString();

      const stage1Log: ExecutionLogChunk = {
        timestamp: new Date().toISOString(),
        stream: 'system',
        chunk: `[STAGE 1] Codebase research complete: identified ${research.relevantFiles.length} key source files (${research.techStack.join(', ')}).\n[STAGE 2] Synthesizing architectural review and phased project plan...\n`,
      };
      job.executionLogs.push(stage1Log);
      this.emitEvent('orchestrator:analyzed', { jobId, researchSummary: research.projectStructureSummary });
      this.emitEvent('orchestrator:log', { jobId, chunk: stage1Log });

      // 2. Architectural Brainstorming & Phased Project Plan
      const { brainstorm, projectPlan } = await this.promptEngineer.createProjectPlan(order, research);
      job.brainstorm = brainstorm;
      job.projectPlan = projectPlan;
      job.updatedAt = new Date().toISOString();

      // If client explicitly requested to skip plan approval (e.g. quick single-shot scripts)
      if (order.skipPlanApproval) {
        return await this.generatePromptsAndAwaitDispatch(jobId);
      }

      // Gate 1: Awaiting Human Plan Approval
      job.status = 'AWAITING_PLAN_APPROVAL';
      job.planApprovalStatus = 'PENDING';
      job.updatedAt = new Date().toISOString();

      const planReadyLog: ExecutionLogChunk = {
        timestamp: new Date().toISOString(),
        stream: 'system',
        chunk: `[STAGE 2] Project plan ready: "${projectPlan.title}" (${projectPlan.phases.length} phases).\n[GATE 1] Awaiting operator review and plan approval before prompt engineering...\n`,
      };
      job.executionLogs.push(planReadyLog);
      this.emitEvent('orchestrator:plan_ready', {
        jobId,
        projectPlan,
        brainstorm,
      });
      this.emitEvent('orchestrator:log', { jobId, chunk: planReadyLog });

      return job;
    } catch (err: any) {
      job.status = 'FAILED';
      job.error = err.message;
      job.updatedAt = new Date().toISOString();
      this.emitEvent('orchestrator:failed', { jobId, error: err.message });
      throw err;
    }
  }

  /**
   * Gate 1 Approval: User approves the phased project plan.
   * JARVIS now proceeds to Stage 2: Prompt engineering and brief prompt report synthesis.
   */
  public async approvePlan(jobId: string, planModifications?: string): Promise<OrchestrationJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Orchestration job not found: ${jobId}`);
    }

    if (job.status !== 'AWAITING_PLAN_APPROVAL') {
      throw new Error(`Job ${jobId} plan cannot be approved in state: ${job.status}`);
    }

    job.planApprovalStatus = 'APPROVED';
    job.status = 'PLAN_APPROVED';
    job.updatedAt = new Date().toISOString();

    const planApproveLog: ExecutionLogChunk = {
      timestamp: new Date().toISOString(),
      stream: 'system',
      chunk: `[GATE 1] Project plan approved by operator. Engineering prompt specification and report...\n`,
    };
    job.executionLogs.push(planApproveLog);
    this.emitEvent('orchestrator:plan_approved', { jobId });
    this.emitEvent('orchestrator:log', { jobId, chunk: planApproveLog });

    return await this.generatePromptsAndAwaitDispatch(jobId, planModifications);
  }

  /**
   * Gate 1 Rejection: User rejects the project plan.
   */
  public async rejectPlan(jobId: string, reason?: string): Promise<OrchestrationJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Orchestration job not found: ${jobId}`);
    }

    job.status = 'REJECTED';
    job.planApprovalStatus = 'REJECTED';
    job.planRejectionReason = reason || 'Project plan rejected by operator';
    job.updatedAt = new Date().toISOString();

    const rejectLog: ExecutionLogChunk = {
      timestamp: new Date().toISOString(),
      stream: 'system',
      chunk: `[GATE 1 REJECTED] Plan rejected: ${job.planRejectionReason}\n`,
    };
    job.executionLogs.push(rejectLog);
    this.emitEvent('orchestrator:plan_rejected', { jobId, reason: job.planRejectionReason });
    this.emitEvent('orchestrator:log', { jobId, chunk: rejectLog });

    return job;
  }

  /**
   * Synthesizes the low-level prompt specification and prompt report,
   * then pauses at Gate 2 (AWAITING_APPROVAL) for operator authorization.
   */
  private async generatePromptsAndAwaitDispatch(
    jobId: string,
    _planModifications?: string
  ): Promise<OrchestrationJob> {
    const job = this.jobs.get(jobId);
    if (!job || !job.research || !job.projectPlan) {
      throw new Error(`Cannot engineer prompt: job ${jobId} missing research or plan`);
    }

    job.status = 'BRAINSTORMING';
    job.updatedAt = new Date().toISOString();

    const prompt = await this.promptEngineer.engineerPromptFromPlan(
      job.order,
      job.research,
      job.projectPlan,
      job.brainstorm
    );

    job.engineeredPrompt = prompt;
    job.status = 'PROMPT_READY';
    job.updatedAt = new Date().toISOString();

    const stage3Log: ExecutionLogChunk = {
      timestamp: new Date().toISOString(),
      stream: 'system',
      chunk: `[STAGE 3] Prompt specification engineered: "${prompt.title}".\n[PROMPT REPORT] What it does: ${prompt.report?.whatItDoes || 'Executes project directive'}\n[PROMPT REPORT] Target files: ${prompt.targetFiles.join(', ') || 'Root repository'}\n[GATE 2] Awaiting operator authorization before launching ${job.engine.toUpperCase()} terminal...\n`,
    };
    job.executionLogs.push(stage3Log);
    this.emitEvent('orchestrator:prompt_ready', {
      jobId,
      promptTitle: prompt.title,
      promptReport: prompt.report,
    });
    this.emitEvent('orchestrator:log', { jobId, chunk: stage3Log });

    // Request Human Approval Gatekeeper
    let approvalId: string | undefined;
    if (this.approvalManager) {
      approvalId = `appr_${crypto.randomUUID().slice(0, 8)}`;
      try {
        await this.approvalManager.evaluateAndRequestApproval({
          action: `opencode.dispatch:${job.engine}`,
          category: 'EXECUTE',
          riskLevel: 'HIGH',
          actor: 'orchestrator:user',
          target: job.order.targetWorkspace,
          reason: `Execution of engineered prompt for: "${job.order.orderText.slice(0, 100)}" in ${path.basename(job.order.targetWorkspace)}`,
          metadata: {
            jobId,
            engine: job.engine,
            promptTitle: prompt.title,
            targetFiles: prompt.targetFiles,
            report: prompt.report,
          },
        });
        job.approvalId = approvalId;
      } catch {
        // If auto-evaluated or queued
      }
    }

    job.status = 'AWAITING_APPROVAL';
    job.approvalStatus = 'PENDING';
    job.updatedAt = new Date().toISOString();

    this.emitEvent('orchestrator:awaiting_approval', {
      jobId,
      promptTitle: prompt.title,
      promptReport: prompt.report,
      promptText: prompt.promptText,
    });

    // Auto-dispatch ONLY if explicitly configured by client
    if (job.order.autoDispatch && job.order.skipPlanApproval) {
      const autoLog: ExecutionLogChunk = {
        timestamp: new Date().toISOString(),
        stream: 'system',
        chunk: `[AUTO-DISPATCH] Auto-dispatch requested. Granting terminal authorization immediately...\n`,
      };
      job.executionLogs.push(autoLog);
      this.emitEvent('orchestrator:log', { jobId, chunk: autoLog });
      setTimeout(() => {
        this.approveJob(jobId).catch((err) => {
          logger.error(`Auto-dispatch failed for ${jobId}: ${err.message}`);
        });
      }, 100);
    }

    return job;
  }

  /**
   * Gate 2 Approval: User authorizes the engineered prompt and report.
   * ONLY HERE is OpenCode / Kilo Code launched in the real terminal window!
   */
  public async approveJob(jobId: string, customPrompt?: string): Promise<OrchestrationJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Orchestration job not found: ${jobId}`);
    }

    if (job.status !== 'AWAITING_APPROVAL' && job.status !== 'PROMPT_READY') {
      throw new Error(`Job ${jobId} cannot be approved in state: ${job.status}`);
    }

    if (customPrompt && job.engineeredPrompt) {
      job.engineeredPrompt.promptText = customPrompt;
      job.engineeredPrompt.version += 1;
    }

    job.status = 'APPROVED';
    job.approvalStatus = 'APPROVED';
    job.updatedAt = new Date().toISOString();

    const approveLog: ExecutionLogChunk = {
      timestamp: new Date().toISOString(),
      stream: 'system',
      chunk: `[GATE 2 APPROVED] Operator authorization confirmed. Launching real terminal and dispatching to ${job.engine.toUpperCase()} CLI...\n`,
    };
    job.executionLogs.push(approveLog);
    this.emitEvent('orchestrator:approved', { jobId });
    this.emitEvent('orchestrator:log', { jobId: job.id, chunk: approveLog });

    // Start background execution (spawns real PowerShell terminal window)
    this.executeDispatch(job).catch((err) => {
      logger.error(`Error in dispatch for job ${jobId}: ${err.message}`);
    });

    return job;
  }

  /**
   * User rejects the prompt.
   */
  public async rejectJob(jobId: string, reason?: string): Promise<OrchestrationJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Orchestration job not found: ${jobId}`);
    }

    job.status = 'REJECTED';
    job.approvalStatus = 'REJECTED';
    job.rejectionReason = reason || 'User rejected the generated prompt';
    job.updatedAt = new Date().toISOString();

    if (job.approvalId && this.approvalManager) {
      try {
        await this.approvalManager.deny(job.approvalId, job.rejectionReason);
      } catch {
        // Best effort
      }
    }

    this.emitEvent('orchestrator:rejected', { jobId, reason: job.rejectionReason });
    return job;
  }

  /**
   * Allows the user to edit the prompt text before approving.
   */
  public updatePromptText(jobId: string, newPromptText: string): OrchestrationJob {
    const job = this.jobs.get(jobId);
    if (!job || !job.engineeredPrompt) {
      throw new Error(`Job or prompt not found: ${jobId}`);
    }
    job.engineeredPrompt.promptText = newPromptText;
    job.engineeredPrompt.version += 1;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  /**
   * Cancels a currently running execution.
   */
  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(jobId);
    }

    const killed = this.bridge.cancelJob(jobId);
    job.status = 'CANCELLED';
    job.updatedAt = new Date().toISOString();
    this.emitEvent('orchestrator:cancelled', { jobId });
    return killed;
  }

  private async executeDispatch(job: OrchestrationJob): Promise<void> {
    const abortController = new AbortController();
    this.abortControllers.set(job.id, abortController);

    job.status = 'DEVELOPING';
    job.updatedAt = new Date().toISOString();
    this.emitEvent('orchestrator:progress', { jobId: job.id, status: 'DEVELOPING' });

    const onLogChunk = (chunk: ExecutionLogChunk) => {
      job.executionLogs.push(chunk);
      this.emitEvent('orchestrator:log', { jobId: job.id, chunk });
    };

    try {
      const result = await this.bridge.dispatch({
        jobId: job.id,
        engine: job.engine,
        workspaceRoot: job.order.targetWorkspace,
        prompt: job.engine === 'opencode' ? (job.order.orderText || job.engineeredPrompt?.promptText || '') : (job.engineeredPrompt?.promptText || job.order.orderText),
        model: job.order.model,
        autoApprove: job.order.autoApprovePermissions ?? true,
        onLogChunk,
        abortSignal: abortController.signal,
      });

      job.exitCode = result.exitCode;
      job.diff = result.diff;
      job.status = result.exitCode === 0 ? 'COMPLETED' : 'FAILED';
      job.completedAt = new Date().toISOString();
      job.updatedAt = job.completedAt;

      const completionLog: ExecutionLogChunk = {
        timestamp: new Date().toISOString(),
        stream: 'system',
        chunk: `\n[STAGE 5] ${job.engine.toUpperCase()} execution finished (exit code: ${result.exitCode}).\n[COMPLETED] Solution diff ready. Files modified: ${result.diff.filesChanged.join(', ') || 'None'}\n`,
      };
      job.executionLogs.push(completionLog);
      this.emitEvent('orchestrator:log', { jobId: job.id, chunk: completionLog });

      this.emitEvent('orchestrator:completed', {
        jobId: job.id,
        status: job.status,
        exitCode: result.exitCode,
        filesChanged: result.diff.filesChanged,
      });
    } catch (err: any) {
      job.status = 'FAILED';
      job.error = err.message;
      job.completedAt = new Date().toISOString();
      job.updatedAt = job.completedAt;

      const errLog: ExecutionLogChunk = {
        timestamp: new Date().toISOString(),
        stream: 'stderr',
        chunk: `\n[EXECUTION ERROR] ${err.message}\n`,
      };
      job.executionLogs.push(errLog);
      this.emitEvent('orchestrator:log', { jobId: job.id, chunk: errLog });

      this.emitEvent('orchestrator:failed', { jobId: job.id, error: err.message });
    } finally {
      this.abortControllers.delete(job.id);
    }
  }

  private emitEvent(type: string, data: Record<string, unknown>): void {
    if (this.eventBus) {
      this.eventBus.emit(createEvent(type as any, 'OpenCodeOrchestrator', data));
    }
  }
}
