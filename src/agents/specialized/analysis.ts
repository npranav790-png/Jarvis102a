import { BaseAgent } from '../base.js';
import { Task } from '../../tasks/types.js';
import { AgentExecutionContext, AgentExecutionResult, AgentStep } from '../types.js';

export class AnalysisAgent extends BaseAgent {
  constructor(options: { toolRegistry?: any; aiService?: any } = {}) {
    super({
      id: 'agent:analysis',
      name: 'Analysis Agent',
      role: 'Codebase, data, and log analysis',
      description: 'Specializes in analyzing architectural structures, logs, diffs, metrics, and failure traces.',
      capabilities: ['analysis.inspect', 'analysis.logs', 'analysis.metrics', 'git.read'],
      supportedTaskTypes: ['PLANNING', 'GENERAL'],
      requiredPermissions: [
        { name: 'analysis:read', action: 'READ', riskLevel: 'LOW', description: 'Read files and logs for analysis' },
      ],
      allowedTools: [
        'filesystem.read',
        'filesystem.search',
        'git.log',
        'git.diff',
      ],
      preferredReasoningMode: 'DEEP',
      toolRegistry: options.toolRegistry,
      aiService: options.aiService,
    });
  }

  public async run(task: Task, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    this.status = 'BUSY';
    const steps: AgentStep[] = [];
    const observations: string[] = [];

    try {
      this.logger.info(`AnalysisAgent analyzing: "${task.title}" [id=${task.id}]`);

      const input = (task.input as Record<string, unknown>) || {};

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
            error: toolRes.error?.message || `Analysis tool ${toolName} failed`,
            steps,
            durationMs: Date.now() - startTime,
          };
        }
        observations.push(toolRes.evidence || `Tool ${toolName} executed successfully.`);
      } else if (this.toolRegistry?.has('git.diff')) {
        const diffRes = await this.invokeTool('git.diff', {}, context, task.id);
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName: 'git.diff',
          toolResult: diffRes,
          evidence: diffRes.evidence,
        });
        observations.push(`Git diff inspected: ${(diffRes.output as any)?.diff ? 'Changes present' : 'Clean'}`);
      }

      this.status = 'READY';
      return {
        success: true,
        output: { observations },
        evidence: observations.join('\n') || `Analysis completed for: ${task.title}`,
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
