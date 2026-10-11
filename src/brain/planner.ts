import crypto from 'node:crypto';
import { PlanRepository, PlanRecord, PlanStepRecord } from '../database/repository.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { AIService } from '../providers/ai-service.js';
import { PlanValidationError, PlanningError } from '../errors/base.js';
import { Plan, PlanStep, PlanStatus, UserIntent } from './types.js';
import { TaskType } from '../tasks/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('PlanningEngine');

export class PlanValidator {
  /**
   * Validates structural integrity and checks for circular dependencies in a plan.
   */
  public static validate(plan: { objective: string; steps: PlanStep[] }): void {
    if (!plan.objective || plan.objective.trim().length === 0) {
      throw new PlanValidationError('Plan must have a non-empty objective.');
    }

    if (!plan.steps || plan.steps.length === 0) {
      throw new PlanValidationError('Plan must contain at least one step.');
    }

    const stepIds = new Set<string>();
    const validTaskTypes: Set<string> = new Set([
      'GENERAL',
      'PLANNING',
      'CODING',
      'RESEARCH',
      'EXECUTION',
      'AUTOMATION',
    ]);

    // 1. Verify step IDs, types, and uniqueness
    for (const step of plan.steps) {
      if (!step.id) {
        throw new PlanValidationError(`Step at index ${step.stepIndex} is missing an ID.`);
      }
      if (stepIds.has(step.id)) {
        throw new PlanValidationError(`Duplicate step ID detected: '${step.id}'.`);
      }
      stepIds.add(step.id);

      if (!validTaskTypes.has(step.type)) {
        throw new PlanValidationError(`Invalid task type '${step.type}' for step '${step.id}'.`);
      }

      if (!step.title || step.title.trim().length === 0) {
        throw new PlanValidationError(`Step '${step.id}' must have a title.`);
      }
    }

    // 2. Verify dependencies reference existing step IDs
    for (const step of plan.steps) {
      for (const depId of step.dependencies) {
        if (depId === step.id) {
          throw new PlanValidationError(`Self-referential dependency detected on step '${step.id}'.`);
        }
        if (!stepIds.has(depId)) {
          throw new PlanValidationError(`Step '${step.id}' references non-existent dependency '${depId}'.`);
        }
      }
    }

    // 3. Cycle Detection (Topological Sort / DFS)
    const visited = new Map<string, 'VISITING' | 'VISITED'>();
    const adj = new Map<string, string[]>();
    for (const step of plan.steps) {
      adj.set(step.id, step.dependencies);
    }

    function hasCycle(node: string): boolean {
      visited.set(node, 'VISITING');
      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        const state = visited.get(neighbor);
        if (state === 'VISITING') {
          return true; // Cycle found
        }
        if (!state && hasCycle(neighbor)) {
          return true;
        }
      }
      visited.set(node, 'VISITED');
      return false;
    }

    for (const step of plan.steps) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id)) {
          throw new PlanValidationError(
            `Circular dependency detected in plan graph involving step '${step.id}'.`
          );
        }
      }
    }
  }
}

export class PlanningEngine {
  constructor(
    private planRepo: PlanRepository,
    private aiService: AIService,
    private eventBus: EventBus
  ) {}

  /**
   * Generates a structured, validated execution plan for an objective.
   */
  public async generatePlan(params: {
    objective: string;
    intent: UserIntent;
    taskId?: string;
    constraints?: string[];
    useFallbackDeterministic?: boolean;
  }): Promise<Plan> {
    const planId = `plan_${crypto.randomUUID().slice(0, 8)}`;
    logger.info(`Starting plan generation for objective: "${params.objective}" [id=${planId}]`);

    await this.eventBus.emit(
      createEvent('brain:planning_started', 'PlanningEngine', {
        planId,
        objective: params.objective,
        intent: params.intent,
      })
    );

    let plan: Plan;

    // Fast deterministic planning for simple tasks or when requested
    if (params.useFallbackDeterministic || params.intent === 'CONVERSATION') {
      plan = this.createDeterministicPlan(planId, params.objective, params.intent, params.taskId);
    } else {
      try {
        plan = await this.generatePlanViaAI(planId, params.objective, params.constraints, params.taskId);
        PlanValidator.validate(plan);
      } catch (err) {
        logger.warn(`AI plan generation or validation failed; falling back to deterministic plan for "${params.objective}":`, err as Record<string, unknown>);
        plan = this.createDeterministicPlan(planId, params.objective, params.intent, params.taskId);
      }
    }

    // Final validation of plan structure and DAG
    PlanValidator.validate(plan);

    // Persist plan and steps to database
    this.savePlan(plan);

    await this.eventBus.emit(
      createEvent('brain:planning_completed', 'PlanningEngine', {
        planId: plan.id,
        stepsCount: plan.steps.length,
      })
    );

    logger.info(`Plan generated and persisted successfully: ${plan.id} (${plan.steps.length} steps)`);
    return plan;
  }

  private async generatePlanViaAI(
    planId: string,
    objective: string,
    constraints?: string[],
    taskId?: string
  ): Promise<Plan> {
    const prompt =
      `Generate a multi-step structured execution plan for: "${objective}"\n` +
      (constraints && constraints.length > 0 ? `Constraints:\n${constraints.map(c => `- ${c}`).join('\n')}\n` : '') +
      `\nOutput strictly valid JSON with this schema:\n` +
      `{\n` +
      `  "assumptions": ["string"],\n` +
      `  "constraints": ["string"],\n` +
      `  "successCriteria": ["string"],\n` +
      `  "risks": ["string"],\n` +
      `  "steps": [\n` +
      `    {\n` +
      `      "id": "step_1",\n` +
      `      "stepIndex": 1,\n` +
      `      "title": "Short title",\n` +
      `      "description": "Step detail",\n` +
      `      "type": "GENERAL | CODING | RESEARCH | PLANNING | EXECUTION",\n` +
      `      "dependencies": [],\n` +
      `      "expectedOutput": "Output artifact description",\n` +
      `      "successCriteria": "Validation test"\n` +
      `    }\n` +
      `  ]\n` +
      `}`;

    const response = await this.aiService.generate({
      modelId: 'default',
      routing: { taskType: 'PLANNING' },
      messages: [
        { role: 'system', content: 'You are the JARVIS 2.0 planning core. Output strictly valid JSON without explanation or formatting code fences.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      responseFormat: { type: 'json' },
    });

    let parsed: any;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      // Clean possible markdown fences
      const cleaned = response.content.replace(/```(json)?/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const now = new Date().toISOString();
    const steps: PlanStep[] = (parsed.steps || []).map((s: any, idx: number) => ({
      id: s.id || `step_${idx + 1}`,
      stepIndex: s.stepIndex || idx + 1,
      title: s.title || `Step ${idx + 1}`,
      description: s.description || '',
      type: (s.type as TaskType) || 'GENERAL',
      dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
      expectedOutput: s.expectedOutput || 'Success',
      successCriteria: s.successCriteria || 'Completed',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    }));

    return {
      id: planId,
      taskId: taskId ?? null,
      objective,
      assumptions: parsed.assumptions || [],
      constraints: parsed.constraints || [],
      successCriteria: parsed.successCriteria || ['All steps completed successfully'],
      risks: parsed.risks || [],
      steps,
      status: 'READY',
      metadata: { generatedBy: 'AIService', model: response.modelId },
      createdAt: now,
      updatedAt: now,
    };
  }

  public createDeterministicPlan(
    planId: string,
    objective: string,
    intent: UserIntent,
    taskId?: string
  ): Plan {
    const now = new Date().toISOString();
    let steps: PlanStep[];

    if (intent === 'CODING') {
      steps = [
        {
          id: `${planId}_s1`,
          stepIndex: 1,
          title: 'Analyze Requirements & Architecture',
          description: `Review requirements and specifications for: "${objective}"`,
          type: 'RESEARCH',
          dependencies: [],
          expectedOutput: 'Architecture & requirements definition',
          successCriteria: 'Requirements understood',
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `${planId}_s2`,
          stepIndex: 2,
          title: 'Implement Code Solution',
          description: `Write and assemble implementation for: "${objective}"`,
          type: 'CODING',
          dependencies: [`${planId}_s1`],
          expectedOutput: 'Source code artifacts',
          successCriteria: 'Code implemented cleanly',
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `${planId}_s3`,
          stepIndex: 3,
          title: 'Verify & Test Solution',
          description: `Verify that implementation meets objective criteria`,
          type: 'EXECUTION',
          dependencies: [`${planId}_s2`],
          expectedOutput: 'Verification test results',
          successCriteria: 'Tests pass and criteria verified',
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        },
      ];
    } else if (intent === 'RESEARCH') {
      steps = [
        {
          id: `${planId}_s1`,
          stepIndex: 1,
          title: 'Information Gathering & Candidate Discovery',
          description: `Gather facts and options for: "${objective}"`,
          type: 'RESEARCH',
          dependencies: [],
          expectedOutput: 'Raw research candidates and data points',
          successCriteria: 'Data collected',
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `${planId}_s2`,
          stepIndex: 2,
          title: 'Comparative Analysis & Synthesis',
          description: `Analyze tradeoffs and summarize recommendations`,
          type: 'PLANNING',
          dependencies: [`${planId}_s1`],
          expectedOutput: 'Structured comparative summary',
          successCriteria: 'Analysis complete with actionable findings',
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        },
      ];
    } else {
      steps = [
        {
          id: `${planId}_s1`,
          stepIndex: 1,
          title: 'Process Task Objective',
          description: `Execute direct resolution for: "${objective}"`,
          type: 'GENERAL',
          dependencies: [],
          expectedOutput: 'Task outcome',
          successCriteria: 'Objective fulfilled',
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        },
      ];
    }

    return {
      id: planId,
      taskId: taskId ?? null,
      objective,
      assumptions: ['Environment is operational', 'Required resources available'],
      constraints: ['Enforce zero-cost policy', 'Respect security boundaries'],
      successCriteria: ['Objective fulfilled cleanly'],
      risks: ['Dependency failure or unavailability'],
      steps,
      status: 'READY',
      metadata: { generatedBy: 'DeterministicFallback' },
      createdAt: now,
      updatedAt: now,
    };
  }

  public savePlan(plan: Plan): void {
    const record: PlanRecord = {
      id: plan.id,
      task_id: plan.taskId,
      objective: plan.objective,
      assumptions_json: JSON.stringify(plan.assumptions),
      constraints_json: JSON.stringify(plan.constraints),
      success_criteria_json: JSON.stringify(plan.successCriteria),
      risks_json: JSON.stringify(plan.risks),
      status: plan.status,
      metadata_json: JSON.stringify(plan.metadata),
      created_at: plan.createdAt,
      updated_at: plan.updatedAt,
    };

    const existing = this.planRepo.findById(plan.id);
    if (existing) {
      this.planRepo.update(record);
    } else {
      this.planRepo.insert(record);
    }

    for (const step of plan.steps) {
      const stepDbId = step.id.startsWith(`${plan.id}:`) ? step.id : `${plan.id}:${step.id}`;
      const stepRecord: PlanStepRecord = {
        id: stepDbId,
        plan_id: plan.id,
        step_index: step.stepIndex,
        title: step.title,
        description: step.description,
        type: step.type,
        dependencies_json: JSON.stringify(step.dependencies),
        expected_output: step.expectedOutput,
        success_criteria: step.successCriteria,
        status: step.status,
        created_at: step.createdAt,
        updated_at: step.updatedAt,
      };

      const existingStep = this.planRepo.findStepById(stepDbId);
      if (existingStep) {
        this.planRepo.updateStep(stepRecord);
      } else {
        this.planRepo.insertStep(stepRecord);
      }
    }
  }

  public getPlan(id: string): Plan | null {
    const record = this.planRepo.findById(id);
    if (!record) return null;

    const stepRecords = this.planRepo.listSteps(id);
    const steps: PlanStep[] = stepRecords.map((s: PlanStepRecord) => ({
      id: s.id.startsWith(`${id}:`) ? s.id.slice(id.length + 1) : s.id,
      stepIndex: s.step_index,
      title: s.title,
      description: s.description,
      type: s.type as TaskType,
      dependencies: JSON.parse(s.dependencies_json || '[]'),
      expectedOutput: s.expected_output,
      successCriteria: s.success_criteria,
      status: s.status as any,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    return {
      id: record.id,
      taskId: record.task_id,
      objective: record.objective,
      assumptions: JSON.parse(record.assumptions_json || '[]'),
      constraints: JSON.parse(record.constraints_json || '[]'),
      successCriteria: JSON.parse(record.success_criteria_json || '[]'),
      risks: JSON.parse(record.risks_json || '[]'),
      steps,
      status: record.status as PlanStatus,
      metadata: JSON.parse(record.metadata_json || '{}'),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
