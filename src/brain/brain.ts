import crypto from 'node:crypto';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { AIService } from '../providers/ai-service.js';
import { TaskManager } from '../tasks/manager.js';
import { ProjectManager } from '../projects/manager.js';
import { SessionManager } from '../sessions/manager.js';
import {
  BrainRequest,
  BrainResponse,
  BrainLimits,
  DEFAULT_BRAIN_LIMITS,
  MemoryItem,
} from './types.js';
import { IntentClassifier, toAITaskType } from './intent.js';
import { ContextEngine } from './context/context-engine.js';
import { MemoryService } from './memory/memory-service.js';
import { MemoryExtractor } from './memory/extraction.js';
import { PlanningEngine } from './planner.js';
import { TaskDecomposer } from './decomposition.js';
import { ReasoningEngine } from './reasoning.js';
import { VerificationEngine } from './verification.js';
import { ReplanManager } from './replan.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('Brain');

export interface BrainComponents {
  eventBus: EventBus;
  aiService: AIService;
  taskManager: TaskManager;
  projectManager: ProjectManager;
  sessionManager: SessionManager;
  contextEngine: ContextEngine;
  memoryService: MemoryService;
  planningEngine: PlanningEngine;
  reasoningEngine: ReasoningEngine;
  verificationEngine: VerificationEngine;
  limits?: Partial<BrainLimits>;
}

export class Brain {
  public readonly eventBus: EventBus;
  public readonly aiService: AIService;
  public readonly taskManager: TaskManager;
  public readonly projectManager: ProjectManager;
  public readonly sessionManager: SessionManager;
  public readonly contextEngine: ContextEngine;
  public readonly memoryService: MemoryService;
  public readonly memoryExtractor: MemoryExtractor;
  public readonly planningEngine: PlanningEngine;
  public readonly taskDecomposer: TaskDecomposer;
  public readonly reasoningEngine: ReasoningEngine;
  public readonly verificationEngine: VerificationEngine;
  public readonly replanManager: ReplanManager;
  public readonly intentClassifier: IntentClassifier;
  public readonly limits: BrainLimits;

  constructor(components: BrainComponents) {
    this.eventBus = components.eventBus;
    this.aiService = components.aiService;
    this.taskManager = components.taskManager;
    this.projectManager = components.projectManager;
    this.sessionManager = components.sessionManager;
    this.contextEngine = components.contextEngine;
    this.memoryService = components.memoryService;
    this.planningEngine = components.planningEngine;
    this.reasoningEngine = components.reasoningEngine;
    this.verificationEngine = components.verificationEngine;

    this.limits = { ...DEFAULT_BRAIN_LIMITS, ...components.limits };
    this.intentClassifier = new IntentClassifier();
    this.taskDecomposer = new TaskDecomposer(this.taskManager);
    this.replanManager = new ReplanManager(this.eventBus, this.limits);
    this.memoryExtractor = new MemoryExtractor(this.memoryService, this.aiService);
  }

  /**
   * Main entry point for the JARVIS Brain.
   * Takes user input, manages memory & context, classifies intent,
   * performs fast-path resolution or multi-step plan decomposition.
   */
  public async process(request: BrainRequest): Promise<BrainResponse> {
    const requestId = request.requestId || `breq_${crypto.randomUUID().slice(0, 8)}`;
    logger.info(`Brain processing request [id=${requestId}]: "${request.userInput}"`);

    await this.eventBus.emit(
      createEvent('brain:request_started', 'Brain', {
        requestId,
        sessionId: request.sessionId,
        projectId: request.projectId,
      })
    );

    // 1. Intent Classification
    const classification = this.intentClassifier.classify(request.userInput);
    const reasoningMode = request.reasoningMode || (classification.isFastPath ? 'FAST' : 'STANDARD');
    const taskType = request.taskType || classification.taskType;

    // 2. Memory Retrieval (Respecting project isolation & relevance)
    const rankedMemories = await this.memoryService.search(request.userInput, {
      targetProjectId: request.projectId,
      maxResults: this.limits.maxMemoryResults,
    });
    const candidateMemories = rankedMemories.map(rm => rm.memory);

    // 3. Context Engine Assembly within Token Budget
    const assembled = this.contextEngine.assembleContext({
      userInput: request.userInput,
      intent: classification.intent,
      reasoningMode,
      projectId: request.projectId,
      sessionId: request.sessionId,
      memories: candidateMemories,
      constraints: request.constraints,
      budgetOverride: request.contextBudget,
    });

    // 4. Branch: Fast-Path vs Complex-Path
    if (classification.isFastPath) {
      return this.executeFastPath({
        requestId,
        request,
        assembled,
        classification,
        reasoningMode,
      });
    }

    return this.executeComplexPath({
      requestId,
      request,
      assembled,
      classification,
      reasoningMode,
      taskType,
      candidateMemories,
    });
  }

  /**
   * Fast-Path Execution: Direct response without creating tasks or complex plan DAGs.
   */
  private async executeFastPath(params: {
    requestId: string;
    request: BrainRequest;
    assembled: ReturnType<ContextEngine['assembleContext']>;
    classification: ReturnType<IntentClassifier['classify']>;
    reasoningMode: any;
  }): Promise<BrainResponse> {
    logger.info(`Executing FAST PATH for request ${params.requestId}`);

    const aiResponse = await this.aiService.generate({
      modelId: 'default',
      routing: {
        taskType: toAITaskType(params.classification.taskType),
        privacyMode: params.request.privacyMode,
      },
      messages: [
        { role: 'system', content: params.assembled.systemPrompt },
        { role: 'user', content: params.assembled.userPrompt },
      ],
      temperature: 0.3,
    });

    // Extract durable memories if any
    const memoryUpdates = await this.memoryExtractor.extractAndStore({
      userInput: params.request.userInput,
      finalResponse: aiResponse.content,
      projectId: params.request.projectId,
      sessionId: params.request.sessionId,
    });

    const response: BrainResponse = {
      requestId: params.requestId,
      sessionId: params.request.sessionId,
      projectId: params.request.projectId,
      finalResponse: aiResponse.content,
      reasoningSummary: `Fast-path resolution completed via ${aiResponse.providerId}/${aiResponse.modelId}.`,
      confidenceStatus: 'VERIFIED',
      executionStatus: 'FAST_PATH',
      sources: [`provider:${aiResponse.providerId}`, `model:${aiResponse.modelId}`],
      memoryUpdates,
      metadata: {
        tokens: aiResponse.usage.totalTokens,
        cost: aiResponse.usage.estimatedCostUSD,
        intent: params.classification.intent,
      },
    };

    await this.eventBus.emit(
      createEvent('brain:request_completed', 'Brain', {
        requestId: params.requestId,
        executionStatus: 'FAST_PATH',
      })
    );

    return response;
  }

  /**
   * Complex-Path Execution: Structured reasoning, plan DAG generation, task decomposition, and verification.
   */
  private async executeComplexPath(params: {
    requestId: string;
    request: BrainRequest;
    assembled: ReturnType<ContextEngine['assembleContext']>;
    classification: ReturnType<IntentClassifier['classify']>;
    reasoningMode: any;
    taskType: any;
    candidateMemories: MemoryItem[];
  }): Promise<BrainResponse> {
    logger.info(`Executing COMPLEX PATH for request ${params.requestId} [type=${params.taskType}]`);

    // 1. Structured Reasoning Step (No raw chain-of-thought)
    const reasoningResult = await this.reasoningEngine.reason({
      objective: params.request.userInput,
      mode: params.reasoningMode,
      intent: params.classification.intent,
      constraints: params.request.constraints,
      sessionId: params.request.sessionId,
      projectId: params.request.projectId,
    });

    // 2. Generate Plan
    const plan = await this.planningEngine.generatePlan({
      objective: params.request.userInput,
      intent: params.classification.intent,
      constraints: params.request.constraints,
    });

    // 3. Decompose Plan into Tasks in TaskManager
    const decomposition = this.taskDecomposer.decomposePlan(plan, {
      projectId: params.request.projectId,
      sessionId: params.request.sessionId,
    });

    // 4. Initial Verification of Plan Creation
    const verification = await this.verificationEngine.verify({
      planId: plan.id,
      objective: plan.objective,
      criteria: plan.successCriteria,
      evidence: [
        `Plan validated with ${plan.steps.length} steps without circular dependencies`,
        `Decomposed into parent task '${decomposition.parentTask.id}' with ${decomposition.childTasks.length} child tasks`,
      ],
    });

    // 5. Synthesize Execution Blueprint Response for User
    const stepsSummary = plan.steps
      .map(s => `${s.stepIndex}. [${s.type}] ${s.title}`)
      .join('\n');

    const finalResponse =
      `I have formulated an execution plan for your request:\n\n` +
      `**Objective**: ${plan.objective}\n` +
      `**Plan ID**: \`${plan.id}\` | **Parent Task**: \`${decomposition.parentTask.id}\`\n\n` +
      `**Steps planned (${plan.steps.length})**:\n${stepsSummary}\n\n` +
      `Tasks are registered in the engine and prepared for agent delegation.`;

    // 6. Extract durable memories
    const memoryUpdates = await this.memoryExtractor.extractAndStore({
      userInput: params.request.userInput,
      finalResponse,
      projectId: params.request.projectId,
      sessionId: params.request.sessionId,
    });

    const response: BrainResponse = {
      requestId: params.requestId,
      sessionId: params.request.sessionId,
      projectId: params.request.projectId,
      finalResponse,
      plan,
      tasks: [decomposition.parentTask, ...decomposition.childTasks],
      reasoningSummary: reasoningResult.decisionSummary,
      confidenceStatus: verification.status,
      executionStatus: 'WAITING_EXECUTION',
      sources: [`plan:${plan.id}`, `task:${decomposition.parentTask.id}`],
      memoryUpdates,
      metadata: {
        intent: params.classification.intent,
        stepsCount: plan.steps.length,
        childTasksCount: decomposition.childTasks.length,
      },
    };

    await this.eventBus.emit(
      createEvent('brain:request_completed', 'Brain', {
        requestId: params.requestId,
        planId: plan.id,
        parentTaskId: decomposition.parentTask.id,
        executionStatus: 'WAITING_EXECUTION',
      })
    );

    return response;
  }

  /**
   * Summarizes a long session's messages into compact context.
   */
  public async summarizeSession(sessionId: string): Promise<string> {
    const session = this.sessionManager.getSession(sessionId);
    const summaryPrompt = this.contextEngine.getPromptManager().getSummarizationPrompt(
      `Session title: "${session.title}"\nStatus: ${session.status}`
    );

    const aiRes = await this.aiService.generate({
      modelId: 'default',
      routing: { taskType: 'GENERAL' },
      messages: [
        { role: 'system', content: 'You are the JARVIS context summarizer. Be concise and factual.' },
        { role: 'user', content: summaryPrompt },
      ],
      temperature: 0.2,
    });

    return aiRes.content;
  }
}
