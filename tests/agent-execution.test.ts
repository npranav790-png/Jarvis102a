import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { TaskRepository, WorkspaceLockRepository } from '../dist/database/repository.js';
import { EventBus } from '../dist/events/bus.js';
import { TaskManager } from '../dist/tasks/manager.js';
import { AgentRegistry } from '../dist/agents/registry.js';
import { AgentSelector } from '../dist/agents/selector.js';
import { AgentExecutor } from '../dist/agents/executor.js';
import { ToolRegistry } from '../dist/tools/registry.js';
import { ALL_BUILTIN_TOOLS } from '../dist/tools/builtin/index.js';
import {
  GeneralAgent,
  CodingAgent,
  ResearchAgent,
  AnalysisAgent,
  AutomationAgent,
} from '../dist/agents/specialized/index.js';
import { WorkspaceManager } from '../dist/workspace/manager.js';
import { AgentLoopLimitError } from '../dist/errors/base.js';

describe('Autonomous Agent Execution & Registry', () => {
  let dbConn: DatabaseConnection;
  let taskManager: TaskManager;
  let agentRegistry: AgentRegistry;
  let toolRegistry: ToolRegistry;
  let workspaceManager: WorkspaceManager;
  let tempDbPath: string;
  let testWorkspace: string;

  before(() => {
    tempDbPath = path.join(os.tmpdir(), `jarvis_agent_test_${Date.now()}.db`);
    dbConn = new DatabaseConnection(tempDbPath);
    const db = dbConn.connect();
    initializeSchema(db);

    const taskRepo = new TaskRepository(db);
    const lockRepo = new WorkspaceLockRepository(db);
    const eventBus = new EventBus();

    taskManager = new TaskManager(taskRepo, eventBus);
    workspaceManager = new WorkspaceManager(lockRepo, eventBus);

    toolRegistry = new ToolRegistry();
    for (const tool of ALL_BUILTIN_TOOLS) {
      toolRegistry.register(tool);
    }

    agentRegistry = new AgentRegistry(eventBus);
    agentRegistry.register(new GeneralAgent({ toolRegistry }));
    agentRegistry.register(new CodingAgent({ toolRegistry }));
    agentRegistry.register(new ResearchAgent({ toolRegistry }));
    agentRegistry.register(new AnalysisAgent({ toolRegistry }));
    agentRegistry.register(new AutomationAgent({ toolRegistry }));

    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis_agent_ws_'));
  });

  after(() => {
    try {
      dbConn.close();
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('AgentRegistry discovers agents by capability and task type', () => {
    const codingAgents = agentRegistry.findByTaskType('CODING');
    assert.strictEqual(codingAgents.length, 1);
    assert.strictEqual(codingAgents[0].id, 'agent:coding');

    const searchAgents = agentRegistry.findByCapability('research.search');
    assert.strictEqual(searchAgents.length, 1);
    assert.strictEqual(searchAgents[0].id, 'agent:research');
  });

  it('AgentSelector selects specialized agent based on task type', () => {
    const selector = new AgentSelector(agentRegistry);

    const codingTask = taskManager.createTask({
      title: 'Fix TypeScript bug',
      type: 'CODING',
    });
    const decision = selector.selectForTask(codingTask);
    assert.strictEqual(decision.selectedAgent.id, 'agent:coding');
    assert.ok(decision.reason.includes('CODING'));

    const researchTask = taskManager.createTask({
      title: 'Investigate performance',
      type: 'RESEARCH',
    });
    const researchDecision = selector.selectForTask(researchTask);
    assert.strictEqual(researchDecision.selectedAgent.id, 'agent:research');
  });

  it('AgentExecutor executes task with tool invocation and updates task status', async () => {
    const executor = new AgentExecutor({
      agentRegistry,
      taskManager,
      workspaceManager,
    });

    const task = taskManager.createTask({
      title: 'Create greetings file',
      type: 'CODING',
      input: {
        toolName: 'filesystem.write',
        toolInput: {
          path: 'greet.txt',
          content: 'Hello from CodingAgent!',
        },
      },
    });

    const result = await executor.executeTask(task.id, {
      rootPath: testWorkspace,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.evidence);

    // Verify task in TaskManager transitioned to COMPLETED
    const updated = taskManager.getTask(task.id);
    assert.strictEqual(updated.status, 'COMPLETED');

    // Verify file actually created
    const filePath = path.join(testWorkspace, 'greet.txt');
    assert.strictEqual(fs.existsSync(filePath), true);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), 'Hello from CodingAgent!');
  });

  it('detects and terminates repeated identical actions to prevent infinite loops', async () => {
    const executor = new AgentExecutor({
      agentRegistry,
      taskManager,
      workspaceManager,
      maxRepeatedActions: 3,
    });

    // Test loop detection method directly
    const repetitiveSteps = [
      { stepNumber: 1, action: 'TOOL_CALL', toolName: 'shell.execute', toolInput: { command: 'ls' } },
      { stepNumber: 2, action: 'TOOL_CALL', toolName: 'shell.execute', toolInput: { command: 'ls' } },
      { stepNumber: 3, action: 'TOOL_CALL', toolName: 'shell.execute', toolInput: { command: 'ls' } },
    ];

    assert.throws(() => {
      (executor as any).detectRepeatedActions(repetitiveSteps);
    }, AgentLoopLimitError);
  });
});
