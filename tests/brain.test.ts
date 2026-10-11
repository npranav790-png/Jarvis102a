import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JarvisEngine } from '../dist/core/engine.js';
import { MockAIProvider } from '../dist/providers/mock.js';

describe('Brain End-to-End Orchestrator (Intent, Context, Memory & Planning)', () => {
  async function createTestEngine() {
    const engine = new JarvisEngine({
      app: { name: 'JARVIS-Test', version: '2.0.0', env: 'test', offline: true },
      database: { path: ':memory:' },
      logging: { level: 'ERROR' as any, format: 'text', redactSecrets: true },
      security: { mode: 'strict', approvalThreshold: 'HIGH' },
      cost: { allowPaidProviders: false, maxCostPerDay: 0.0 },
      privacy: { mode: 'PREFER_LOCAL' },
      providers: {
        priority: ['mock-provider'],
        allowFreeModelsOnly: true,
        ollama: { enabled: false, type: 'local', baseUrl: 'http://localhost:11434' },
        groq: { enabled: false, type: 'cloud', allowFreeModelsOnly: true },
        openrouter: { enabled: false, type: 'cloud', allowFreeModelsOnly: true },
        huggingface: { enabled: false, type: 'cloud', allowFreeModelsOnly: true },
      },
    });

    await engine.initialize();

    // Register Mock AI provider for predictable offline generation
    const mockProvider = new MockAIProvider('mock-provider');
    mockProvider.setResponseGenerator(req => {
      // If asking for a plan JSON
      if (req.messages.some(m => m.content.includes('structured execution plan') || m.content.includes('execution plan'))) {
        return JSON.stringify({
          objective: 'Test plan',
          assumptions: ['Testing environment active'],
          constraints: ['Zero cost'],
          successCriteria: ['Completed'],
          risks: [],
          steps: [
            {
              id: 's1',
              stepIndex: 1,
              title: 'Initialize workspace',
              description: 'Create directory and files',
              type: 'GENERAL',
              dependencies: [],
              expectedOutput: 'Workspace initialized',
              successCriteria: 'Files exist',
            },
            {
              id: 's2',
              stepIndex: 2,
              title: 'Run implementation',
              description: 'Implement functionality',
              type: 'CODING',
              dependencies: ['s1'],
              expectedOutput: 'Code written',
              successCriteria: 'Builds successfully',
            },
          ],
        });
      }

      // If summarization prompt
      if (req.messages.some(m => m.content.includes('Summarize the following interaction history'))) {
        return 'Summary: Session discussed technical architecture and agreed on TypeScript and SQLite.';
      }

      // Default response
      return 'I have processed your request completely.';
    });

    engine.providerRegistry.register(mockProvider);
    return engine;
  }

  it('routes trivial conversational requests through FAST_PATH without creating tasks', async () => {
    const engine = await createTestEngine();

    const tasksBefore = engine.taskManager.listTasks().length;
    const res = await engine.brain.process({
      userInput: 'Hello JARVIS! Good day to you.',
    });

    assert.strictEqual(res.executionStatus, 'FAST_PATH');
    assert.strictEqual(res.confidenceStatus, 'VERIFIED');
    assert.ok(res.finalResponse.length > 0);

    // Assert that no tasks were bloated into TaskManager for simple chit-chat
    const tasksAfter = engine.taskManager.listTasks().length;
    assert.strictEqual(tasksAfter, tasksBefore, 'Fast path must not create tasks in database');

    await engine.shutdown();
  });

  it('routes coding and complex tasks through COMPLEX_PATH with plan generation and task decomposition', async () => {
    const engine = await createTestEngine();

    const project = engine.projectManager.createProject({
      name: 'Coding Project',
      rootPath: process.cwd(),
    });

    const res = await engine.brain.process({
      userInput: 'Build a Python command line tool that validates JSON files',
      projectId: project.id,
    });

    assert.strictEqual(res.executionStatus, 'WAITING_EXECUTION');
    assert.ok(res.plan, 'Complex path must produce a plan');
    assert.ok(res.plan.steps.length >= 2, 'Plan must contain generated steps');
    assert.ok(res.tasks && res.tasks.length > 0, 'Plan must be decomposed into tasks in TaskManager');

    // Verify parent and child task relationship in TaskManager
    const parent = res.tasks.find(t => t.id === res.plan?.taskId);
    assert.ok(parent, 'Parent task must exist');

    const children = res.tasks.filter(t => t.parentTaskId === parent.id);
    assert.strictEqual(children.length, res.plan.steps.length);

    await engine.shutdown();
  });

  it('automatically extracts and persists user preferences during interaction', async () => {
    const engine = await createTestEngine();

    const res = await engine.brain.process({
      userInput: 'Please remember that I prefer TypeScript instead of JavaScript for all new files.',
    });

    // Check if memory was stored
    const memories = engine.memoryService.listMemories();
    const foundPref = memories.some(m => m.content.toLowerCase().includes('prefers') || m.content.toLowerCase().includes('typescript'));
    assert.strictEqual(foundPref, true, 'User preference should be automatically distilled into memory');

    await engine.shutdown();
  });

  it('summarizes session history into high-density context', async () => {
    const engine = await createTestEngine();

    const session = engine.sessionManager.createSession({
      title: 'Architecture Discussion',
    });

    const summary = await engine.brain.summarizeSession(session.id);
    assert.ok(summary.includes('Summary:'));

    await engine.shutdown();
  });
});
