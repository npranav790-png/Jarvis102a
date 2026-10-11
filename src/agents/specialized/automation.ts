import { BaseAgent } from '../base.js';
import { Task } from '../../tasks/types.js';
import { AgentExecutionContext, AgentExecutionResult, AgentStep } from '../types.js';

export class AutomationAgent extends BaseAgent {
  constructor(options: { toolRegistry?: any; aiService?: any } = {}) {
    super({
      id: 'agent:automation',
      name: 'Automation Agent',
      role: 'Operational workflow execution and script automation',
      description: 'Specializes in running multi-step operational tasks, processes, and build commands.',
      capabilities: ['automation.workflow', 'process.control', 'shell.script', 'shell.execute'],
      supportedTaskTypes: ['AUTOMATION', 'EXECUTION'],
      requiredPermissions: [
        { name: 'automation:execute', action: 'EXECUTE', riskLevel: 'HIGH', description: 'Run automation commands' },
      ],
      allowedTools: [
        'shell.execute',
        'process.start',
        'process.status',
        'process.stop',
        'git.checkout',
        'git.add',
        'git.commit',
        'filesystem.delete',
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
    const executionLogs: string[] = [];

    try {
      this.logger.info(`AutomationAgent executing: "${task.title}" [id=${task.id}]`);

      const input = task.input as Record<string, unknown> || {};

      // If specific tool call requested
      if ('toolName' in input && typeof input.toolName === 'string') {
        const toolName = input.toolName;
        const toolInput = (input.toolInput as any) || {};
        const toolRes = await this.invokeTool(toolName, toolInput, context, task.id);
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName,
          toolInput,
          toolResult: toolRes,
          evidence: toolRes.evidence,
        });

        if (!toolRes.success) {
          this.status = 'FAILED';
          return {
            success: false,
            error: toolRes.error?.message || `Automation tool ${toolName} failed`,
            steps,
            durationMs: Date.now() - startTime,
          };
        }
        executionLogs.push(`Tool '${toolName}' executed successfully.`);
      } else if ('command' in input && typeof input.command === 'string') {
        const cmdRes = await this.invokeTool('shell.execute', { command: input.command }, context, task.id);
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName: 'shell.execute',
          toolInput: { command: input.command },
          toolResult: cmdRes,
          evidence: cmdRes.evidence,
        });

        if (!cmdRes.success) {
          this.status = 'FAILED';
          return {
            success: false,
            error: cmdRes.error?.message || 'Automation command failed',
            steps,
            durationMs: Date.now() - startTime,
          };
        }
        executionLogs.push(`Command '${input.command}' executed successfully.`);
      } else {
        executionLogs.push(`Automation workflow '${task.title}' completed.`);
      }

      this.status = 'READY';
      return {
        success: true,
        output: { logs: executionLogs },
        evidence: executionLogs.join('\n'),
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
