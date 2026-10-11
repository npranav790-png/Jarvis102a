import { IAgent, AgentDefinition, AgentExecutionContext, AgentExecutionResult, AgentModelRequirements, AgentHealth, AgentStep } from './types.js';
import { Task, TaskType } from '../tasks/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { AIService } from '../providers/ai-service.js';
import { ReasoningMode } from '../brain/types.js';
import { SecurityPermission } from '../security/types.js';
import { ToolRequest, ToolResult } from '../tools/types.js';
import { rootLogger } from '../logging/logger.js';

export interface BaseAgentConfig {
  id: string;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  supportedTaskTypes: TaskType[];
  requiredPermissions: SecurityPermission[];
  allowedTools: string[];
  preferredReasoningMode?: ReasoningMode;
  modelRequirements?: AgentModelRequirements;
  toolRegistry?: ToolRegistry;
  aiService?: AIService;
}

export abstract class BaseAgent implements IAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly role: string;
  public readonly description: string;
  public readonly capabilities: string[];
  public readonly supportedTaskTypes: TaskType[];
  public readonly requiredPermissions: SecurityPermission[];
  public readonly allowedTools: string[];
  public readonly preferredReasoningMode: ReasoningMode;
  public readonly modelRequirements: AgentModelRequirements;
  public status: AgentHealth = 'READY';
  public enabled: boolean = true;

  protected toolRegistry?: ToolRegistry;
  protected aiService?: AIService;
  protected logger = rootLogger.child(this.constructor.name);

  constructor(config: BaseAgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.description = config.description;
    this.capabilities = config.capabilities;
    this.supportedTaskTypes = config.supportedTaskTypes;
    this.requiredPermissions = config.requiredPermissions;
    this.allowedTools = config.allowedTools;
    this.preferredReasoningMode = config.preferredReasoningMode || 'STANDARD';
    this.modelRequirements = config.modelRequirements || { minContextWindow: 4096, supportsTools: true };
    this.toolRegistry = config.toolRegistry;
    this.aiService = config.aiService;
  }

  public setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  public setAIService(service: AIService): void {
    this.aiService = service;
  }

  public definition(): AgentDefinition {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      description: this.description,
      capabilities: this.capabilities,
      supportedTaskTypes: this.supportedTaskTypes,
      requiredPermissions: this.requiredPermissions,
      allowedTools: this.allowedTools,
      preferredReasoningMode: this.preferredReasoningMode,
      enabled: this.enabled,
      modelRequirements: this.modelRequirements,
      status: this.status,
    };
  }

  /**
   * Invokes a tool safely through the ToolRegistry, enforcing allowedTools constraint.
   */
  protected async invokeTool<TInput = unknown, TOutput = unknown>(
    toolName: string,
    input: TInput,
    context: AgentExecutionContext,
    taskId?: string
  ): Promise<ToolResult<TOutput>> {
    if (!this.toolRegistry) {
      throw new Error(`ToolRegistry not available on agent '${this.id}'`);
    }

    if (!this.allowedTools.includes(toolName) && !this.allowedTools.includes('*')) {
      return {
        callId: `tcall_denied_${Date.now()}`,
        toolName,
        success: false,
        status: 'FAILED',
        error: {
          code: 'TOOL_NOT_PERMITTED',
          message: `Tool '${toolName}' is not in allowedTools list for agent '${this.id}'`,
        },
        durationMs: 0,
      };
    }

    const toolRequest: ToolRequest<TInput> = {
      callId: `tcall_${this.id.split(':')[1] || 'agent'}_${Date.now()}`,
      toolName,
      input,
      context: {
        ...context,
        actor: this.id,
        taskId,
      },
      signal: context.signal,
    };

    return this.toolRegistry.executeTool(toolRequest) as Promise<ToolResult<TOutput>>;
  }

  public abstract run(task: Task, context: AgentExecutionContext): Promise<AgentExecutionResult>;
}
