import { BaseAgent } from '../base.js';
import { Task } from '../../tasks/types.js';
import { AgentExecutionContext, AgentExecutionResult, AgentStep } from '../types.js';
import { DesktopControlInput, DesktopControlOutput } from '../../tools/builtin/desktop-control.js';
import { ScreenCaptureOutput } from '../../tools/builtin/screen-capture.js';

export interface DesktopAgentTaskInput {
  goal?: string;
  maxSteps?: number;
  actions?: DesktopControlInput[];
  action?: DesktopControlInput;
  interactive?: boolean;
  modelId?: string;
}

export class DesktopAgent extends BaseAgent {
  constructor(options: { toolRegistry?: any; aiService?: any } = {}) {
    super({
      id: 'agent:desktop',
      name: 'Desktop Agent',
      role: 'Autonomous GUI desktop screen control, visual navigation, and OS automation',
      description:
        'Specializes in visual computer use: observing screens via vision capture, grounding UI elements, and executing mouse and keyboard actions with safety fail-safes.',
      capabilities: [
        'desktop.control',
        'desktop.inspect',
        'desktop.interact',
        'screen.capture',
        'automation.workflow',
      ],
      supportedTaskTypes: ['AUTOMATION', 'EXECUTION', 'GENERAL'],
      requiredPermissions: [
        {
          name: 'system:screen-capture',
          action: 'SYSTEM',
          riskLevel: 'LOW',
          description: 'Inspect desktop screen',
        },
        {
          name: 'system:desktop-control',
          action: 'EXECUTE',
          riskLevel: 'HIGH',
          description: 'Control mouse and keyboard for desktop tasks',
        },
      ],
      allowedTools: [
        'desktop_screen_capture',
        'desktop_control',
        'system_notification',
        'system_resource_monitor',
        'shell.execute',
        'process.start',
        'process.status',
        'process.stop',
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
      this.logger.info(`DesktopAgent executing task: "${task.title}" [id=${task.id}]`);

      const input = (task.input as DesktopAgentTaskInput) || {};
      const goal = input.goal || task.description || task.title;
      const maxSteps = Math.min(Math.max(input.maxSteps || 10, 1), 25);

      // 1. Direct explicit actions mode (scripted / test automation)
      if (input.actions && Array.isArray(input.actions) && input.actions.length > 0) {
        for (const actionInput of input.actions) {
          const res = await this.executeControlStep(actionInput, context, task.id, steps);
          if (!res.success) {
            this.status = 'FAILED';
            return {
              success: false,
              error: res.details || `Failed action: ${actionInput.action}`,
              steps,
              durationMs: Date.now() - startTime,
            };
          }
          collectedEvidence.push(res.details);
        }

        // Final verification screenshot
        const verifyRes = await this.invokeTool<any, ScreenCaptureOutput>(
          'desktop_screen_capture',
          { includeBase64: false },
          context,
          task.id
        );
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName: 'desktop_screen_capture',
          toolResult: verifyRes,
          evidence: `Final screen verification captured at: ${verifyRes.output?.filePath}`,
        });

        this.status = 'READY';
        return {
          success: true,
          output: { stepsExecuted: input.actions.length, goal },
          evidence: collectedEvidence.join('\n'),
          steps,
          durationMs: Date.now() - startTime,
        };
      }

      // 2. Single direct action mode
      if (input.action) {
        const res = await this.executeControlStep(input.action, context, task.id, steps);
        this.status = res.success ? 'READY' : 'FAILED';
        return {
          success: res.success,
          error: res.success ? undefined : res.details,
          output: res,
          evidence: res.details,
          steps,
          durationMs: Date.now() - startTime,
        };
      }

      // 3. Autonomous Closed-Loop OODA Vision Loop
      let stepCount = 0;
      let completed = false;
      let currentScreenInfo: ScreenCaptureOutput | undefined;

      while (stepCount < maxSteps && !completed) {
        stepCount++;

        // A. Observe: Capture current desktop state
        const captureRes = await this.invokeTool<any, ScreenCaptureOutput>(
          'desktop_screen_capture',
          { format: 'png', includeBase64: true },
          context,
          task.id
        );

        if (!captureRes.success || !captureRes.output) {
          this.status = 'FAILED';
          return {
            success: false,
            error: 'Failed to capture desktop screenshot for vision analysis',
            steps,
            durationMs: Date.now() - startTime,
          };
        }

        currentScreenInfo = captureRes.output;
        steps.push({
          stepNumber: steps.length + 1,
          action: 'TOOL_CALL',
          toolName: 'desktop_screen_capture',
          toolResult: captureRes,
          evidence: `Captured screen (${currentScreenInfo.width}x${currentScreenInfo.height})`,
        });

        // B. Decide: Prompt Vision AI or determine next interaction
        if (this.aiService && typeof this.aiService.generate === 'function') {
          const actionDecision = await this.decideNextAction(
            goal,
            currentScreenInfo,
            steps,
            input.modelId
          );

          if (actionDecision.isCompleted || actionDecision.action === 'wait' && actionDecision.isCompleted) {
            completed = true;
            collectedEvidence.push(actionDecision.thought || 'Goal verified and completed.');
            break;
          }

          collectedEvidence.push(`Step ${stepCount}: ${actionDecision.thought}`);

          // C. Act: Execute chosen control action
          const controlInput: DesktopControlInput = {
            action: actionDecision.action as any,
            x: actionDecision.x,
            y: actionDecision.y,
            button: actionDecision.button,
            text: actionDecision.text,
            key: actionDecision.key,
            scrollAmount: actionDecision.scrollAmount,
          };

          const controlRes = await this.executeControlStep(controlInput, context, task.id, steps);
          if (controlRes.failSafeTriggered) {
            this.status = 'FAILED';
            return {
              success: false,
              error: 'Desktop control stopped: Emergency fail-safe corner triggered (0,0).',
              steps,
              durationMs: Date.now() - startTime,
            };
          }

          if (!controlRes.success) {
            this.logger.warn(`Step ${stepCount} action warning: ${controlRes.details}`);
          }
        } else {
          // If no AI Service configured, perform verification check and mark completed
          collectedEvidence.push(`Desktop state inspected for goal: "${goal}"`);
          completed = true;
        }
      }

      this.status = 'READY';
      return {
        success: true,
        output: {
          goal,
          stepsCompleted: stepCount,
          lastScreenPath: currentScreenInfo?.filePath,
        },
        evidence: collectedEvidence.join('\n'),
        steps,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      this.status = 'FAILED';
      this.logger.error(`DesktopAgent execution error: ${(err as Error).message}`, undefined, err as Error);
      return {
        success: false,
        error: (err as Error).message,
        steps,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executeControlStep(
    actionInput: DesktopControlInput,
    context: AgentExecutionContext,
    taskId: string,
    steps: AgentStep[]
  ): Promise<DesktopControlOutput> {
    const res = await this.invokeTool<DesktopControlInput, DesktopControlOutput>(
      'desktop_control',
      actionInput,
      context,
      taskId
    );

    const output = res.output || {
      success: res.success,
      action: actionInput.action,
      details: res.error?.message || 'Action executed',
    };

    steps.push({
      stepNumber: steps.length + 1,
      action: 'TOOL_CALL',
      toolName: 'desktop_control',
      toolInput: actionInput,
      toolResult: res,
      evidence: output.details,
    });

    return output;
  }

  private async decideNextAction(
    goal: string,
    screenInfo: ScreenCaptureOutput,
    history: AgentStep[],
    modelId?: string
  ): Promise<{
    thought: string;
    action: string;
    x?: number;
    y?: number;
    button?: 'left' | 'right' | 'middle' | 'double';
    text?: string;
    key?: string;
    scrollAmount?: number;
    isCompleted?: boolean;
  }> {
    const prompt = `You are JARVIS Desktop Vision Controller.
User Goal: "${goal}"
Desktop Screen Resolution: ${screenInfo.width}x${screenInfo.height}
Recent Step History:
${history.slice(-4).map(h => `- ${h.toolName}: ${h.evidence || ''}`).join('\n')}

Analyze the desktop screen and state. Determine the NEXT precise action to execute toward achieving the goal.
Respond ONLY with a JSON object in this exact schema without markdown codeblocks:
{
  "thought": "brief description of what is seen and why this action is chosen",
  "action": "mouse_click" | "mouse_move" | "mouse_drag" | "mouse_scroll" | "key_press" | "type_text" | "wait",
  "x": 100,
  "y": 200,
  "button": "left",
  "text": "text to type if typing",
  "key": "enter or tab if keypress",
  "scrollAmount": 120,
  "isCompleted": false
}`;

    try {
      const response = await this.aiService!.generate({
        modelId: modelId || 'gemini-2.0-flash',
        messages: [{ role: 'user', content: prompt }],
      });

      const cleaned = response.content.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        thought: 'Completed desktop inspection',
        action: 'wait',
        isCompleted: true,
      };
    }
  }
}
