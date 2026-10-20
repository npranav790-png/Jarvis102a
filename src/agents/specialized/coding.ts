import { BaseAgent } from '../base.js';
import { Task } from '../../tasks/types.js';
import { AgentExecutionContext, AgentExecutionResult, AgentStep } from '../types.js';

export class CodingAgent extends BaseAgent {
  constructor(options: { toolRegistry?: any; aiService?: any } = {}) {
    super({
      id: 'agent:coding',
      name: 'Coding Agent',
      role: 'Software engineering, file modification, testing and debugging',
      description: 'Specializes in code understanding, repository edits, running tests, refactoring, and fixing defects.',
      capabilities: [
        'code.inspect',
        'code.modify',
        'code.test',
        'code.debug',
        'code.refactor',
        'filesystem.write',
        'filesystem.read',
      ],
      supportedTaskTypes: ['CODING'],
      requiredPermissions: [
        { name: 'code:read', action: 'READ', riskLevel: 'LOW', description: 'Read codebase files' },
        { name: 'code:write', action: 'WRITE', riskLevel: 'MEDIUM', description: 'Modify codebase files' },
        { name: 'code:execute', action: 'EXECUTE', riskLevel: 'HIGH', description: 'Execute tests and build scripts' },
      ],
      allowedTools: [
        'filesystem.list',
        'filesystem.read',
        'filesystem.write',
        'filesystem.create',
        'filesystem.delete',
        'filesystem.search',
        'code.test',
        'code.diagnose',
        'system_notification',
        'shell.execute',
        'git.status',
        'git.diff',
        'git.add',
        'git.commit',
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
    const collectedEvidence: string[] = [];

    try {
      this.logger.info(`CodingAgent running task: "${task.title}" [id=${task.id}]`);

      const input = (task.input as Record<string, unknown>) || {};

      // 1. Check if specific tool call provided in task input
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
            error: toolRes.error?.message || `Failed to execute ${toolName}`,
            steps,
            durationMs: Date.now() - startTime,
          };
        }
        collectedEvidence.push(toolRes.evidence || `Tool ${toolName} executed successfully.`);
      }

      // If task directs writing a file
      if ('filePath' in input && 'fileContent' in input) {
        const filePath = input.filePath as string;
        let fileContent = input.fileContent as string;

        const writeRes = await this.invokeTool('filesystem.write', { path: filePath, content: fileContent }, context, task.id);
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName: 'filesystem.write',
          toolInput: { path: filePath },
          toolResult: writeRes,
          evidence: writeRes.evidence,
        });

        if (!writeRes.success) {
          this.status = 'FAILED';
          return {
            success: false,
            error: writeRes.error?.message || 'Failed to write file',
            steps,
            durationMs: Date.now() - startTime,
          };
        }
        collectedEvidence.push(`File written successfully: ${filePath}`);

        // 2. Autonomous Self-Healing Diagnostic Loop
        if (input.autoHeal !== false && this.toolRegistry?.has('code.diagnose')) {
          const diagnoseRes = await this.invokeTool(
            'code.diagnose',
            { filePath, runner: (input.runner as any) || 'auto' },
            context,
            task.id
          );
          steps.push({
            stepNumber: steps.length + 1,
            action: 'TOOL_CALL',
            toolName: 'code.diagnose',
            toolResult: diagnoseRes,
            evidence: diagnoseRes.evidence,
          });

          const diagOutput = diagnoseRes.output as any;
          if (diagOutput && !diagOutput.clean && diagOutput.errorCount > 0) {
            collectedEvidence.push(`Diagnostic check flagged ${diagOutput.errorCount} error(s). Initiating autonomous self-healing loop...`);

            if (this.aiService && typeof this.aiService.generate === 'function') {
              try {
                const repairPrompt = `The file "${filePath}" failed typecheck with errors:\n${diagOutput.summary}\nFull errors:\n${diagOutput.rawOutput}\n\nCurrent code:\n${fileContent}\n\nPlease output the completely repaired source code for this file without any markdown code fence wrapping or explanation.`;
                const repairResult = await this.aiService.generate({
                  modelId: (input.modelId as string) || 'gemini-2.0-flash',
                  messages: [{ role: 'user', content: repairPrompt }],
                });
                if (repairResult && repairResult.content) {

                  const cleanedCode = repairResult.content.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
                  const reWriteRes = await this.invokeTool('filesystem.write', { path: filePath, content: cleanedCode }, context, task.id);
                  steps.push({
                    stepNumber: steps.length + 1,
                    action: 'TOOL_CALL',
                    toolName: 'filesystem.write',
                    toolInput: { path: filePath, reason: 'Autonomous repair of typecheck diagnostics' },
                    toolResult: reWriteRes,
                    evidence: 'Applied autonomous diagnostic repair patch',
                  });

                  // Re-diagnose after repair
                  const reDiag = await this.invokeTool('code.diagnose', { filePath, runner: (input.runner as any) || 'auto' }, context, task.id);
                  const reDiagOutput = reDiag.output as any;
                  if (reDiagOutput?.clean) {
                    collectedEvidence.push(`Self-healing successfully resolved all diagnostic errors in ${filePath}!`);
                  } else {
                    collectedEvidence.push(`Self-healing partially resolved errors. Remaining errors: ${reDiagOutput?.errorCount}`);
                  }
                }
              } catch (healErr: any) {
                collectedEvidence.push(`Self-healing attempt could not complete: ${healErr.message}`);
              }
            } else {
              collectedEvidence.push(`Diagnostic warnings recorded: ${diagOutput.summary}`);
            }

          } else {
            collectedEvidence.push(`Typecheck verified clean: 0 errors in ${filePath}.`);
          }
        }
      }

      // If task directs running diagnostics directly
      if (input.runDiagnostics === true && this.toolRegistry?.has('code.diagnose')) {
        const diagRes = await this.invokeTool('code.diagnose', { runner: (input.runner as any) || 'auto' }, context, task.id);
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName: 'code.diagnose',
          toolResult: diagRes,
          evidence: diagRes.evidence,
        });
        collectedEvidence.push(diagRes.evidence || (diagRes.output as any)?.summary || 'Diagnostics executed');
      }

      // If task directs running tests
      if (input.runTests === true || task.title.toLowerCase().includes('test') || task.title.toLowerCase().includes('run')) {
        if (this.toolRegistry?.has('code.test')) {
          const testRes = await this.invokeTool('code.test', { runner: (input.runner as any) || 'auto' }, context, task.id);
          steps.push({
            stepNumber: steps.length + 1,
            action: 'TOOL_CALL',
            toolName: 'code.test',
            toolResult: testRes,
            evidence: testRes.evidence,
          });

          collectedEvidence.push(testRes.evidence || (testRes.output as any)?.summary || 'Tests executed');

          if (!testRes.success) {
            this.status = 'FAILED';
            return {
              success: false,
              output: testRes.output,
              evidence: collectedEvidence.join('\n'),
              steps,
              durationMs: Date.now() - startTime,
            };
          }
        }
      }

      // Trigger desktop notification if requested
      if (input.notify === true && this.toolRegistry?.has('system_notification')) {
        const notifRes = await this.invokeTool(
          'system_notification',
          {
            title: `JARVIS: Coding Task Complete`,
            message: `Task "${task.title}" finished successfully (${steps.length} steps).`,
            urgency: 'NORMAL',
          },
          context,
          task.id
        );
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName: 'system_notification',
          toolResult: notifRes,
          evidence: notifRes.evidence,
        });
      }



      // Default evidence if nothing else executed
      if (collectedEvidence.length === 0) {
        collectedEvidence.push(`Coding task '${task.title}' processed by CodingAgent.`);
      }

      this.status = 'READY';
      return {
        success: true,
        output: { message: `Completed coding task: ${task.title}`, stepsCount: steps.length },
        evidence: collectedEvidence.join('\n'),
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
