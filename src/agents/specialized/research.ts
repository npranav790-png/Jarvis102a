import { BaseAgent } from '../base.js';
import { Task } from '../../tasks/types.js';
import { AgentExecutionContext, AgentExecutionResult, AgentStep } from '../types.js';

export class ResearchAgent extends BaseAgent {
  constructor(options: { toolRegistry?: any; aiService?: any } = {}) {
    super({
      id: 'agent:research',
      name: 'Research Agent',
      role: 'Research, codebase exploration and information gathering',
      description: 'Specializes in inspecting documentation, searching codebases, and synthesizing findings.',
      capabilities: ['research.gather', 'research.search', 'information.summarize', 'filesystem.search', 'filesystem.read'],
      supportedTaskTypes: ['RESEARCH'],
      requiredPermissions: [
        { name: 'research:read', action: 'READ', riskLevel: 'LOW', description: 'Read files and search resources' },
      ],
      allowedTools: [
        'filesystem.list',
        'filesystem.read',
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
    const findings: string[] = [];

    try {
      this.logger.info(`ResearchAgent researching: "${task.title}" [id=${task.id}]`);

      const input = (task.input as Record<string, unknown>) || {};
      const query = (input.query as string) || task.title;

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
            error: toolRes.error?.message || `Research tool ${toolName} failed`,
            steps,
            durationMs: Date.now() - startTime,
          };
        }
        findings.push(toolRes.evidence || `Tool ${toolName} executed successfully.`);
      } else if (this.toolRegistry?.has('filesystem.search')) {
        const searchRes = await this.invokeTool('filesystem.search', { query }, context, task.id);
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName: 'filesystem.search',
          toolInput: { query },
          toolResult: searchRes,
          evidence: searchRes.evidence,
        });

        const results = (searchRes.output as any)?.results || [];
        findings.push(`Found ${results.length} search matches for '${query}'`);
      }

      this.status = 'READY';
      return {
        success: true,
        output: { findings },
        evidence: findings.join('\n') || `Research completed for: ${task.title}`,
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
