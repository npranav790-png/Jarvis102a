import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection } from '../dist/database/connection.js';
import { initializeSchema } from '../dist/database/schema.js';
import { PlanRepository, TaskRepository, EventRepository } from '../dist/database/repository.js';
import { EventBus } from '../dist/events/bus.js';
import { TaskManager } from '../dist/tasks/manager.js';
import { PlanValidator, PlanningEngine } from '../dist/brain/planner.js';
import { TaskDecomposer } from '../dist/brain/decomposition.js';
import { PlanValidationError } from '../dist/errors/base.js';
import type { PlanStep } from '../dist/brain/types.js';

describe('Planning Engine, DAG Validation & Task Decomposition', () => {
  it('validates a valid acyclic plan DAG without error', () => {
    const validPlan = {
      objective: 'Build CLI tool',
      steps: [
        {
          id: 'step_1',
          stepIndex: 1,
          title: 'Design spec',
          description: 'Spec',
          type: 'RESEARCH' as const,
          dependencies: [],
          expectedOutput: 'Spec doc',
          successCriteria: 'Spec written',
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'step_2',
          stepIndex: 2,
          title: 'Implement CLI',
          description: 'Implementation',
          type: 'CODING' as const,
          dependencies: ['step_1'],
          expectedOutput: 'Code',
          successCriteria: 'CLI works',
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    assert.doesNotThrow(() => PlanValidator.validate(validPlan));
  });

  it('rejects plan with missing objective or duplicate step IDs', () => {
    assert.throws(
      () => PlanValidator.validate({ objective: '', steps: [] }),
      PlanValidationError
    );

    const dupPlan = {
      objective: 'Duplicate step test',
      steps: [
        {
          id: 'step_dup',
          stepIndex: 1,
          title: 'Step 1',
          description: '',
          type: 'GENERAL' as const,
          dependencies: [],
          expectedOutput: '',
          successCriteria: '',
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'step_dup', // Duplicate ID
          stepIndex: 2,
          title: 'Step 2',
          description: '',
          type: 'GENERAL' as const,
          dependencies: [],
          expectedOutput: '',
          successCriteria: '',
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    assert.throws(() => PlanValidator.validate(dupPlan), PlanValidationError);
  });

  it('rejects plans with circular dependencies in DAG', () => {
    const cyclePlan = {
      objective: 'Circular dependency test',
      steps: [
        {
          id: 'step_a',
          stepIndex: 1,
          title: 'Task A',
          description: '',
          type: 'GENERAL' as const,
          dependencies: ['step_b'], // A depends on B
          expectedOutput: '',
          successCriteria: '',
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'step_b',
          stepIndex: 2,
          title: 'Task B',
          description: '',
          type: 'GENERAL' as const,
          dependencies: ['step_a'], // B depends on A (Cycle: A <-> B)
          expectedOutput: '',
          successCriteria: '',
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    assert.throws(
      () => PlanValidator.validate(cyclePlan),
      (err: any) => err instanceof PlanValidationError && err.message.includes('Circular dependency')
    );
  });

  it('generates and persists deterministic fallback plan', async () => {
    const dbConn = new DatabaseConnection(':memory:');
    const db = dbConn.connect();
    initializeSchema(db);

    const planRepo = new PlanRepository(db);
    const eventRepo = new EventRepository(db);
    const eventBus = new EventBus(eventRepo);

    // Mock AI service for fallback testing
    const fakeAIService = {} as any;
    const planner = new PlanningEngine(planRepo, fakeAIService, eventBus);

    const plan = await planner.generatePlan({
      objective: 'Build student marks analyzer in Python',
      intent: 'CODING',
      useFallbackDeterministic: true,
    });

    assert.strictEqual(plan.steps.length, 3);
    assert.strictEqual(plan.steps[0].type, 'RESEARCH');
    assert.strictEqual(plan.steps[1].type, 'CODING');
    assert.strictEqual(plan.steps[2].type, 'EXECUTION');

    // Retrieve from database to verify persistence
    const loaded = planner.getPlan(plan.id);
    assert.ok(loaded);
    assert.strictEqual(loaded?.objective, plan.objective);
    assert.strictEqual(loaded?.steps.length, 3);

    dbConn.close();
  });

  it('decomposes plan into parent and child tasks in TaskManager', async () => {
    const dbConn = new DatabaseConnection(':memory:');
    const db = dbConn.connect();
    initializeSchema(db);

    const planRepo = new PlanRepository(db);
    const taskRepo = new TaskRepository(db);
    const eventRepo = new EventRepository(db);
    const eventBus = new EventBus(eventRepo);
    const taskManager = new TaskManager(taskRepo, eventBus);
    const decomposer = new TaskDecomposer(taskManager);

    const fakeAIService = {} as any;
    const planner = new PlanningEngine(planRepo, fakeAIService, eventBus);

    const plan = await planner.generatePlan({
      objective: 'Research and compare cloud providers',
      intent: 'RESEARCH',
      useFallbackDeterministic: true,
    });

    const decomposed = decomposer.decomposePlan(plan);
    assert.ok(decomposed.parentTask.id);
    assert.strictEqual(decomposed.childTasks.length, plan.steps.length);

    // Verify all child tasks have parentTaskId set
    for (const child of decomposed.childTasks) {
      assert.strictEqual(child.parentTaskId, decomposed.parentTask.id);
    }

    dbConn.close();
  });
});
