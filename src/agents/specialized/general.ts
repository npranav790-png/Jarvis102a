import { BaseAgent } from '../base.js';
import { Task } from '../../tasks/types.js';
import { AgentExecutionContext, AgentExecutionResult, AgentStep } from '../types.js';

export class GeneralAgent extends BaseAgent {
  constructor(options: { toolRegistry?: any; aiService?: any } = {}) {
    super({
      id: 'agent:general',
      name: 'General Agent',
      role: 'General-purpose autonomous task execution',
      description: 'Orchestrates general problem-solving, information synthesis, and multi-tool coordination.',
      capabilities: ['general.execute', 'task.orchestration', 'filesystem.read', 'filesystem.list'],
      supportedTaskTypes: ['GENERAL', 'PLANNING'],
      requiredPermissions: [
        { name: 'general:read', action: 'READ', riskLevel: 'LOW', description: 'General read access' },
      ],
      allowedTools: [
        'filesystem.list',
        'filesystem.read',
        'filesystem.write',
        'filesystem.search',
      ],
      preferredReasoningMode: 'STANDARD',
      toolRegistry: options.toolRegistry,
      aiService: options.aiService,
    });
  }

  public async run(task: Task, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    this.status = 'BUSY';
    const steps: AgentStep[] = [];

    try {
      this.logger.info(`GeneralAgent starting task: "${task.title}" [id=${task.id}]`);

      // 1. If task input provides specific tool call
      if (task.input && typeof task.input === 'object' && 'toolName' in task.input) {
        const toolName = (task.input as any).toolName;
        const toolInput = (task.input as any).toolInput || {};

        const toolRes = await this.invokeTool(toolName, toolInput, context, task.id);
        steps.push({
          stepNumber: 1,
          action: 'TOOL_CALL',
          toolName,
          toolInput,
          toolResult: toolRes,
          evidence: toolRes.evidence,
        });

        this.status = 'READY';
        return {
          success: toolRes.success,
          output: toolRes.output,
          evidence: toolRes.evidence,
          steps,
          toolCallCount: 1,
          durationMs: Date.now() - startTime,
        };
      }

      // 2. Default execution: Inspect directory context if rootPath provided
      let evidence = `General agent executed task '${task.title}'.`;
      if (this.toolRegistry && this.toolRegistry.has('filesystem.list')) {
        const listRes = await this.invokeTool('filesystem.list', { path: '.' }, context, task.id);
        steps.push({
          stepNumber: 1,
          action: 'TOOL_CALL',
          toolName: 'filesystem.list',
          toolResult: listRes,
          evidence: listRes.evidence,
        });
        evidence = `Inspected workspace: ${((listRes.output as any)?.entries || []).length} items found.`;
      }

      this.status = 'READY';
      return {
        success: true,
        output: { message: `Completed task: ${task.title}` },
        evidence,
        steps,
        toolCallCount: steps.length,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      this.status = 'FAILED';
      return {
        success: false,
        error: err.message,
        steps,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
