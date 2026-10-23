import { describe, it } from 'node:test';
import assert from 'node:assert';
import { desktopControlTool } from '../dist/tools/builtin/desktop-control.js';
import { screenCaptureTool } from '../dist/tools/builtin/screen-capture.js';
import { DesktopAgent } from '../dist/agents/specialized/desktop.js';
import { ToolRegistry } from '../dist/tools/registry.js';
import { ALL_BUILTIN_TOOLS } from '../dist/tools/builtin/index.js';
import type { Task } from '../dist/tasks/types.js';

describe('JARVIS 2.0 — Agentic Desktop Control & Computer Use Subsystem', () => {
  it('1. Initializes desktopControlTool with correct schema, security category, and permissions', () => {
    assert.strictEqual(desktopControlTool.name, 'desktop_control');
    assert.strictEqual(desktopControlTool.category, 'SYSTEM');
    assert.strictEqual(desktopControlTool.riskLevel, 'HIGH');
    assert.ok(desktopControlTool.description.includes('fail-safe'));
    assert.ok(Array.isArray(desktopControlTool.permissions));
    assert.strictEqual(desktopControlTool.permissions[0].name, 'system:desktop-control');
  });

  it('2. Triggers emergency fail-safe corner when target is (0,0) or <= 5px', async () => {
    const res = await desktopControlTool.execute({
      action: 'mouse_move',
      x: 0,
      y: 0,
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.failSafeTriggered, true);
    assert.ok(res.details.includes('Emergency fail-safe corner triggered'));
  });

  it('3. Executes mouse actions safely (move, click, drag, scroll)', async () => {
    // Simulated mode to verify protocol deterministically
    const moveRes = await desktopControlTool.execute({
      action: 'mouse_move',
      x: 500,
      y: 400,
      simulate: true,
    });
    assert.strictEqual(moveRes.success, true);
    assert.deepStrictEqual(moveRes.cursorPosition, { x: 500, y: 400 });

    const clickRes = await desktopControlTool.execute({
      action: 'mouse_click',
      button: 'left',
      x: 520,
      y: 420,
      simulate: true,
    });
    assert.strictEqual(clickRes.success, true);
    assert.deepStrictEqual(clickRes.cursorPosition, { x: 520, y: 420 });

    const dragRes = await desktopControlTool.execute({
      action: 'mouse_drag',
      x: 100,
      y: 100,
      endX: 300,
      endY: 300,
      simulate: true,
    });
    assert.strictEqual(dragRes.success, true);
    assert.deepStrictEqual(dragRes.cursorPosition, { x: 300, y: 300 });

    const scrollRes = await desktopControlTool.execute({
      action: 'mouse_scroll',
      scrollAmount: 120,
      simulate: true,
    });
    assert.strictEqual(scrollRes.success, true);
  });

  it('4. Executes keyboard actions (typing, special keys, wait)', async () => {
    const typeRes = await desktopControlTool.execute({
      action: 'type_text',
      text: 'echo "Hello JARVIS Agentic AI"',
      simulate: true,
    });
    assert.strictEqual(typeRes.success, true);
    assert.ok(typeRes.details.includes('Hello JARVIS Agentic AI'));

    const keyRes = await desktopControlTool.execute({
      action: 'key_press',
      key: 'enter',
      simulate: true,
    });
    assert.strictEqual(keyRes.success, true);
    assert.ok(keyRes.details.includes('enter'));

    const waitRes = await desktopControlTool.execute({
      action: 'wait',
      delayMs: 50,
      simulate: true,
    });
    assert.strictEqual(waitRes.success, true);
  });

  it('5. DesktopAgent exposes computer-use capabilities and registers allowed tools', () => {
    const agent = new DesktopAgent();
    assert.strictEqual(agent.id, 'agent:desktop');
    assert.ok(agent.capabilities.includes('desktop.control'));
    assert.ok(agent.capabilities.includes('desktop.inspect'));
    assert.ok(agent.capabilities.includes('screen.capture'));
    assert.ok(agent.allowedTools.includes('desktop_screen_capture'));
    assert.ok(agent.allowedTools.includes('desktop_control'));
  });

  it('6. DesktopAgent executes multi-step scripted desktop workflow with vision verification', async () => {
    const toolRegistry = new ToolRegistry();
    for (const tool of ALL_BUILTIN_TOOLS) {
      toolRegistry.register(tool);
    }

    const agent = new DesktopAgent({ toolRegistry });

    const task: Task = {
      id: 'task_desktop_workflow_1',
      parentTaskId: null,
      sessionId: null,
      projectId: null,
      title: 'Automate Calculator input',
      description: 'Open UI, click buttons, type expression, and verify result',
      type: 'AUTOMATION',
      status: 'CREATED',
      priority: 5,
      input: {
        goal: 'Type and calculate formula',
        actions: [
          { action: 'mouse_move', x: 200, y: 200, simulate: true },
          { action: 'mouse_click', button: 'left', x: 200, y: 200, simulate: true },
          { action: 'type_text', text: '42 * 2', simulate: true },
          { action: 'key_press', key: 'enter', simulate: true },
        ],
      },
      output: null,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      metadata: {},
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      updatedAt: new Date().toISOString(),
    };

    const executionContext = {
      actor: 'test-runner',
      sessionId: 'sess_desktop_1',
      projectId: 'proj_desktop_1',
    };

    const result = await agent.run(task, executionContext as any);

    assert.strictEqual(result.success, true);
    assert.ok(result.steps);
    const steps = result.steps;
    assert.ok(steps.length >= 5); // 4 actions + 1 final screen capture verification

    const toolNames = steps.map(s => s.toolName);
    assert.ok(toolNames.includes('desktop_control'));
    assert.ok(toolNames.includes('desktop_screen_capture'));
  });

  it('7. DesktopAgent terminates safely on emergency fail-safe trigger', async () => {
    const toolRegistry = new ToolRegistry();
    for (const tool of ALL_BUILTIN_TOOLS) {
      toolRegistry.register(tool);
    }

    const agent = new DesktopAgent({ toolRegistry });

    const task: Task = {
      id: 'task_desktop_failsafe_1',
      parentTaskId: null,
      sessionId: null,
      projectId: null,
      title: 'Move to corner',
      description: 'Trigger emergency fail-safe',
      type: 'AUTOMATION',
      status: 'CREATED',
      priority: 5,
      input: {
        goal: 'Emergency abort test',
        action: { action: 'mouse_move', x: 0, y: 0 },
      },
      output: null,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      metadata: {},
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      updatedAt: new Date().toISOString(),
    };

    const result = await agent.run(task, { actor: 'test-runner' } as any);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('fail-safe'));
  });

  it('8. DesktopAgent runs closed-loop autonomous vision cycle', async () => {
    const toolRegistry = new ToolRegistry();
    for (const tool of ALL_BUILTIN_TOOLS) {
      toolRegistry.register(tool);
    }

    // Mock AI Service responding with spatial grounding step then completion
    let callCount = 0;
    const mockAIService = {
      generate: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            content: JSON.stringify({
              thought: 'Locate search box at (400, 300) and click',
              action: 'mouse_click',
              x: 400,
              y: 300,
              button: 'left',
              isCompleted: false,
            }),
          };
        } else {
          return {
            content: JSON.stringify({
              thought: 'Search input active. Goal completed.',
              action: 'wait',
              isCompleted: true,
            }),
          };
        }
      },
    };

    const agent = new DesktopAgent({ toolRegistry, aiService: mockAIService as any });

    const task: Task = {
      id: 'task_desktop_ooda_1',
      parentTaskId: null,
      sessionId: null,
      projectId: null,
      title: 'Autonomous Screen Navigation',
      description: 'Search for documentation on screen',
      type: 'AUTOMATION',
      status: 'CREATED',
      priority: 5,
      input: {
        goal: 'Find documentation icon and click it',
        maxSteps: 5,
      },
      output: null,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      metadata: {},
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      updatedAt: new Date().toISOString(),
    };

    const result = await agent.run(task, { actor: 'test-runner' } as any);
    assert.strictEqual(result.success, true);
    assert.ok(result.steps);
    assert.ok(result.steps.length >= 2);
    assert.ok(callCount >= 1);
  });
});
