import crypto from 'node:crypto';
import { ITool, ToolExecutionContext, ToolRequest, ToolResult, ToolStatus, ToolDefinition } from './types.js';
import { ToolNotFoundError, ToolExecutionError, ToolValidationError, ToolTimeoutError, ValidationError } from '../errors/base.js';
import { ApprovalGatekeeper } from '../security/approval.js';
import { ApprovalManager } from '../security/approval-manager.js';
import { ToolCallRepository, ToolCallRecord } from '../database/repository.js';
import { ArtifactManager } from './artifacts.js';
import { MemorySanitizer } from '../brain/memory/sanitizer.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { toolToDeclaration, ToolDeclaration } from './declarations.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('ToolRegistry');

export class ToolRegistry {
  private tools = new Map<string, ITool<any, any>>();
  private toolStatuses = new Map<string, ToolStatus>();

  constructor(
    private approvalGatekeeper?: ApprovalGatekeeper,
    private eventBus?: EventBus,
    private approvalManager?: ApprovalManager,
    private toolCallRepo?: ToolCallRepository,
    private artifactManager?: ArtifactManager
  ) {}

  public register(tool: ITool<any, any>): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Overwriting registered tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    this.toolStatuses.set(tool.name, tool.status || 'AVAILABLE');
    logger.info(`Tool registered: ${tool.name} (v${tool.version}, category=${tool.category}, risk=${tool.riskLevel})`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('tool:registered', 'ToolRegistry', {
        name: tool.name,
        category: tool.category,
        riskLevel: tool.riskLevel,
        capabilities: tool.capabilities || [],
      }));
    }
  }

  public unregister(name: string): boolean {
    const deleted = this.tools.delete(name);
    this.toolStatuses.delete(name);
    return deleted;
  }

  public get(name: string): ITool<any, any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    return tool;
  }

  public list(): ITool<any, any>[] {
    return Array.from(this.tools.values());
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public getStatus(name: string): ToolStatus {
    return this.toolStatuses.get(name) || (this.tools.has(name) ? 'AVAILABLE' : 'UNAVAILABLE');
  }

  public setStatus(name: string, status: ToolStatus): void {
    if (!this.tools.has(name)) throw new ToolNotFoundError(name);
    this.toolStatuses.set(name, status);
  }

  public findByCapability(capability: string): ITool<any, any>[] {
    return this.list().filter(tool => {
      const caps = tool.capabilities || [];
      return caps.includes(capability) || caps.some(c => c.startsWith(`${capability}.`));
    });
  }

  /**
   * Generates LLM function calling schema declarations for available registered tools.
   */
  public getDeclarations(filter?: (tool: ITool<any, any>) => boolean): ToolDeclaration[] {
    const tools = filter ? this.list().filter(filter) : this.list();
    return tools
      .filter(t => this.getStatus(t.name) === 'AVAILABLE')
      .map(t => toolToDeclaration(t));
  }

  /**
   * Executes a tool request through the security gate, audits the call,
   * enforces timeouts, sanitizes output, and returns a structured ToolResult.
   */
  public async executeTool(request: ToolRequest): Promise<ToolResult> {
    const callId = request.callId || `tcall_${crypto.randomUUID().slice(0, 8)}`;
    const toolName = request.toolName;
    const tool = this.get(toolName);
    const status = this.getStatus(toolName);

    if (status === 'DISABLED' || status === 'UNAVAILABLE') {
      return {
        callId,
        toolName,
        success: false,
        status: 'FAILED',
        error: { code: 'TOOL_UNAVAILABLE', message: `Tool '${toolName}' is currently ${status}.` },
        durationMs: 0,
      };
    }

    if (this.eventBus) {
      await this.eventBus.emit(
        createEvent('tool:requested', 'ToolRegistry', {
          callId,
          toolName,
          input: request.input,
          taskId: request.context.taskId,
        }, request.context.taskId)
      );
    }

    // 1. Schema Validation
    const parsedInput = tool.inputSchema.safeParse(request.input);
    if (!parsedInput.success) {
      const errorMsg = `Invalid parameters for tool '${toolName}': ${JSON.stringify(parsedInput.error.format())}`;
      return {
        callId,
        toolName,
        success: false,
        status: 'FAILED',
        error: { code: 'TOOL_VALIDATION_ERROR', message: errorMsg, details: parsedInput.error.issues },
        durationMs: 0,
      };
    }

    // 2. Initial record creation in ToolCallRepository
    const startTime = Date.now();
    if (this.toolCallRepo) {
      const callRecord: ToolCallRecord = {
        id: callId,
        task_id: request.context.taskId ?? null,
        session_id: request.context.sessionId ?? null,
        project_id: request.context.projectId ?? null,
        agent_id: (request.context.actor as string) ?? null,
        tool_name: toolName,
        input_json: JSON.stringify(request.input),
        output_json: null,
        error_json: null,
        status: 'REQUESTED',
        risk_level: tool.riskLevel,
        execution_time_ms: 0,
        created_at: new Date().toISOString(),
        completed_at: null,
      };
      this.toolCallRepo.insert(callRecord);
    }

    // 3. Risk & Policy Approval Check
    try {
      if (this.approvalManager) {
        await this.approvalManager.evaluateAndRequestApproval({
          action: `tool:${tool.name}`,
          category: tool.category,
          riskLevel: tool.riskLevel,
          actor: request.context.actor || 'agent',
          target: (request.context.rootPath || request.context.projectId || 'system') as string,
          taskId: request.context.taskId,
          toolCallId: callId,
          metadata: { toolName: tool.name, input: request.input },
        });
      } else if (this.approvalGatekeeper) {
        await this.approvalGatekeeper.evaluateAndRequestApproval({
          action: `tool:${tool.name}`,
          category: tool.category,
          riskLevel: tool.riskLevel,
          actor: request.context.actor || 'agent',
          target: (request.context.rootPath || request.context.projectId || 'system') as string,
          metadata: { toolName: tool.name, input: request.input, taskId: request.context.taskId },
        });
      }

      if (this.toolCallRepo) {
        this.toolCallRepo.update({
          id: callId,
          task_id: request.context.taskId ?? null,
          session_id: request.context.sessionId ?? null,
          project_id: request.context.projectId ?? null,
          agent_id: (request.context.actor as string) ?? null,
          tool_name: toolName,
          input_json: JSON.stringify(request.input),
          output_json: null,
          error_json: null,
          status: 'STARTED',
          risk_level: tool.riskLevel,
          execution_time_ms: 0,
          created_at: new Date().toISOString(),
          completed_at: null,
        });
      }
    } catch (approvalErr: any) {
      logger.warn(`Approval denied or rejected for tool '${toolName}' [callId=${callId}]: ${approvalErr.message}`);
      if (this.toolCallRepo) {
        this.toolCallRepo.update({
          id: callId,
          task_id: request.context.taskId ?? null,
          session_id: request.context.sessionId ?? null,
          project_id: request.context.projectId ?? null,
          agent_id: (request.context.actor as string) ?? null,
          tool_name: toolName,
          input_json: JSON.stringify(request.input),
          output_json: null,
          error_json: JSON.stringify({ code: approvalErr.code || 'APPROVAL_REJECTED', message: approvalErr.message }),
          status: 'FAILED',
          risk_level: tool.riskLevel,
          execution_time_ms: 0,
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      }
      return {
        callId,
        toolName,
        success: false,
        status: 'FAILED',
        error: { code: approvalErr.code || 'APPROVAL_REJECTED', message: approvalErr.message },
        durationMs: 0,
      };
    }

    if (this.eventBus) {
      await this.eventBus.emit(
        createEvent('tool:started', 'ToolRegistry', { callId, toolName, taskId: request.context.taskId }, request.context.taskId)
      );
    }

    // 4. Execute with timeout and cancellation protection
    const timeoutMs = request.context.timeoutMs || 30000;
    try {
      logger.info(`Executing tool '${tool.name}' [callId=${callId}]...`);

      const executionPromise = tool.execute(parsedInput.data, {
        ...request.context,
        callId,
        dryRun: request.dryRun,
        signal: request.signal,
      });

      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ToolTimeoutError(toolName, timeoutMs));
        }, timeoutMs);
      });

      const rawResult = await Promise.race([executionPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);

      const durationMs = Date.now() - startTime;

      // Optional output validation
      if (tool.outputSchema) {
        tool.outputSchema.safeParse(rawResult);
      }

      // Check if result created artifacts
      const artifacts: any[] = [];
      if (this.artifactManager && typeof rawResult === 'object' && rawResult !== null) {
        if ('path' in rawResult && typeof (rawResult as any).path === 'string') {
          try {
            const art = this.artifactManager.recordArtifact({
              taskId: request.context.taskId,
              toolCallId: callId,
              name: (rawResult as any).name || (rawResult as any).path,
              path: (rawResult as any).path,
            });
            artifacts.push(art);
          } catch {
            // Ignore artifact recording errors
          }
        }
      }

      // Generate structured evidence summary
      let evidence = `Tool '${toolName}' executed successfully in ${durationMs}ms.`;
      if (typeof rawResult === 'object' && rawResult !== null) {
        if ('summary' in rawResult && typeof (rawResult as any).summary === 'string') {
          evidence = (rawResult as any).summary;
        } else if ('stdout' in rawResult && typeof (rawResult as any).stdout === 'string') {
          evidence = (rawResult as any).stdout.slice(0, 500);
        }
      }

      // Sanitize output
      const sanitizedEvidence = MemorySanitizer.redactSecrets(evidence);

      // Update DB record
      if (this.toolCallRepo) {
        this.toolCallRepo.update({
          id: callId,
          task_id: request.context.taskId ?? null,
          session_id: request.context.sessionId ?? null,
          project_id: request.context.projectId ?? null,
          agent_id: (request.context.actor as string) ?? null,
          tool_name: toolName,
          input_json: JSON.stringify(request.input),
          output_json: JSON.stringify(rawResult),
          error_json: null,
          status: 'COMPLETED',
          risk_level: tool.riskLevel,
          execution_time_ms: durationMs,
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      }

      if (this.eventBus) {
        await this.eventBus.emit(
          createEvent('tool:completed', 'ToolRegistry', {
            callId,
            toolName,
            taskId: request.context.taskId,
            durationMs,
            success: true,
          }, request.context.taskId)
        );
      }

      return {
        callId,
        toolName,
        success: true,
        status: 'SUCCESS',
        output: rawResult,
        evidence: sanitizedEvidence,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        durationMs,
        exitCode: (rawResult as any)?.exitCode,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isTimeout = err instanceof ToolTimeoutError;
      const isCancelled = err?.message?.includes('cancelled');
      const finalStatus = isCancelled ? 'CANCELLED' : (isTimeout ? 'TIMED_OUT' : 'FAILED');

      logger.error(`Execution failed for tool '${tool.name}' [callId=${callId}]`, undefined, err);

      if (this.toolCallRepo) {
        this.toolCallRepo.update({
          id: callId,
          task_id: request.context.taskId ?? null,
          session_id: request.context.sessionId ?? null,
          project_id: request.context.projectId ?? null,
          agent_id: (request.context.actor as string) ?? null,
          tool_name: toolName,
          input_json: JSON.stringify(request.input),
          output_json: null,
          error_json: JSON.stringify({ message: err.message, code: err.code }),
          status: finalStatus,
          risk_level: tool.riskLevel,
          execution_time_ms: durationMs,
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      }

      if (this.eventBus) {
        await this.eventBus.emit(
          createEvent('tool:failed', 'ToolRegistry', {
            callId,
            toolName,
            taskId: request.context.taskId,
            error: err.message,
            status: finalStatus,
          }, request.context.taskId)
        );
      }

      return {
        callId,
        toolName,
        success: false,
        status: finalStatus,
        error: { code: err.code || 'TOOL_EXECUTION_ERROR', message: err.message },
        durationMs,
      };
    }
  }

  /**
   * Backwards-compatible execution method returning raw output.
   */
  public async execute(name: string, rawInput: unknown, context: ToolExecutionContext = {}): Promise<unknown> {
    const tool = this.get(name);

    // 1. Validate Input Schema
    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new ValidationError(
        `Invalid parameters for tool '${name}': ${JSON.stringify(parsedInput.error.format())}`,
        { issues: parsedInput.error.issues }
      );
    }

    // 2. Security & Approval Gate
    if (this.approvalManager) {
      await this.approvalManager.evaluateAndRequestApproval({
        action: `tool:${tool.name}`,
        category: tool.category,
        riskLevel: tool.riskLevel,
        actor: context.actor || 'system',
        target: (context.rootPath || context.projectId || 'system') as string,
        taskId: context.taskId,
        metadata: { toolName: tool.name, input: rawInput },
      });
    } else if (this.approvalGatekeeper) {
      await this.approvalGatekeeper.evaluateAndRequestApproval({
        action: `tool:${tool.name}`,
        category: tool.category,
        riskLevel: tool.riskLevel,
        actor: context.actor || 'system',
        target: (context.rootPath || context.projectId || 'system') as string,
        metadata: { toolName: tool.name, input: rawInput, taskId: context.taskId },
      });
    }

    // 3. Execute Tool
    try {
      logger.info(`Executing tool '${tool.name}'...`, { taskId: context.taskId });
      const result = await tool.execute(parsedInput.data, context);

      // Optional output validation
      if (tool.outputSchema) {
        tool.outputSchema.parse(result);
      }

      if (this.eventBus) {
        this.eventBus.emit(createEvent('tool:executed', 'ToolRegistry', {
          toolName: tool.name,
          taskId: context.taskId,
          success: true,
        }, context.taskId));
      }

      return result;
    } catch (err) {
      logger.error(`Execution failed for tool '${tool.name}'`, { taskId: context.taskId }, err as Error);
      throw new ToolExecutionError(tool.name, (err as Error).message, err as Error);
    }
  }
}
