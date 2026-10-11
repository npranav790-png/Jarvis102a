import path from 'node:path';
import { AIService } from '../../providers/ai-service.js';
import {
  ResearchResult,
  BrainstormResult,
  EngineeredPrompt,
  OrchestrationOrder,
  ProjectPlan,
  ProjectPlanPhase,
  PromptReport,
} from './types.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('SpecPromptEngine');

export class SpecPromptEngine {
  constructor(private aiService?: AIService) {}

  /**
   * Stage 1: Researches the request, brainstorms architecture,
   * and creates a phased, reviewable project plan for human approval.
   */
  public async createProjectPlan(
    order: OrchestrationOrder,
    research: ResearchResult
  ): Promise<{ brainstorm: BrainstormResult; projectPlan: ProjectPlan }> {
    logger.info(`Creating phased project plan for order: "${order.orderText}"`);

    if (this.aiService) {
      try {
        return await this.generatePlanViaAI(order, research);
      } catch (err: any) {
        logger.warn(`AI plan generation failed, using deterministic synthesis: ${err.message}`);
      }
    }

    return this.generatePlanDeterministic(order, research);
  }

  /**
   * Stage 2: After plan approval, engineers the exact prompt for OpenCode / Kilo Code
   * and produces a brief prompt report explaining what it does.
   */
  public async engineerPromptFromPlan(
    order: OrchestrationOrder,
    research: ResearchResult,
    projectPlan: ProjectPlan,
    brainstorm?: BrainstormResult
  ): Promise<EngineeredPrompt> {
    logger.info(`Engineering prompt from approved plan: "${projectPlan.title}"`);

    if (this.aiService) {
      try {
        return await this.generatePromptViaAI(order, research, projectPlan, brainstorm);
      } catch (err: any) {
        logger.warn(`AI prompt synthesis failed, using deterministic synthesis: ${err.message}`);
      }
    }

    return this.generatePromptDeterministic(order, research, projectPlan, brainstorm);
  }

  /**
   * Backward compatible all-in-one synthesis for tests or single-shot execution.
   */
  public async analyzeAndEngineer(
    order: OrchestrationOrder,
    research: ResearchResult
  ): Promise<{ brainstorm: BrainstormResult; prompt: EngineeredPrompt; projectPlan: ProjectPlan }> {
    const { brainstorm, projectPlan } = await this.createProjectPlan(order, research);
    const prompt = await this.engineerPromptFromPlan(order, research, projectPlan, brainstorm);
    return { brainstorm, prompt, projectPlan };
  }

  private async generatePlanViaAI(
    order: OrchestrationOrder,
    research: ResearchResult
  ): Promise<{ brainstorm: BrainstormResult; projectPlan: ProjectPlan }> {
    const systemPrompt = `You are the JARVIS Principal Software Architect.
Analyze the user's project request and codebase context to brainstorm technical architecture and build a structured, phased project plan.
Output MUST be valid JSON strictly matching this schema:
{
  "brainstorm": {
    "problemSummary": "string",
    "architecturalApproach": "string",
    "technicalDecisions": ["string"],
    "affectedComponents": ["string"],
    "potentialRisks": ["string"],
    "suggestedValidation": "string"
  },
  "projectPlan": {
    "title": "string",
    "summary": "string",
    "architecturalReview": "string",
    "technicalDecisions": ["string"],
    "phases": [
      {
        "phaseNumber": 1,
        "title": "string",
        "description": "string",
        "tasks": ["string"],
        "deliverables": ["string"]
      }
    ],
    "risksAndMitigations": ["string"],
    "validationCriteria": ["string"]
  }
}`;

    const userContent = `Order: "${order.orderText}"
Project Workspace: ${research.projectRoot}
Tech Stack: ${research.techStack.join(', ')}
Discovered Manifests: ${research.manifests.join(', ')}
Project Structure:
${research.projectStructureSummary}

Relevant Files:
${research.relevantFiles.map((f) => `- ${f.relativePath} (${f.lineCount || 'unknown'} lines)`).join('\n')}

Synthesize the architectural brainstorm and a detailed, phased project plan.`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI plan generation timeout')), 6000)
    );

    const res = await Promise.race([
      this.aiService!.generate({
        modelId: 'default',
        routing: { taskType: 'CODING', privacyMode: 'ALLOW_CLOUD' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
      }),
      timeoutPromise,
    ]);

    const parsed = JSON.parse(res.content);
    const brainstorm: BrainstormResult = {
      problemSummary: parsed.brainstorm?.problemSummary || `Implement: ${order.orderText}`,
      architecturalApproach: parsed.brainstorm?.architecturalApproach || 'Modular phased implementation',
      technicalDecisions: parsed.brainstorm?.technicalDecisions || ['Follow repository architecture'],
      affectedComponents: parsed.brainstorm?.affectedComponents || research.relevantFiles.map((f) => f.relativePath),
      potentialRisks: parsed.brainstorm?.potentialRisks || ['Ensure backward compatibility'],
      suggestedValidation: parsed.brainstorm?.suggestedValidation || 'Run build and test suite',
    };

    const projectPlan: ProjectPlan = {
      title: parsed.projectPlan?.title || (order.title || `Project Plan: ${order.orderText.slice(0, 50)}`),
      summary: parsed.projectPlan?.summary || `Implementation plan for: "${order.orderText}"`,
      architecturalReview: parsed.projectPlan?.architecturalReview || brainstorm.architecturalApproach,
      technicalDecisions: parsed.projectPlan?.technicalDecisions || brainstorm.technicalDecisions,
      phases: Array.isArray(parsed.projectPlan?.phases) && parsed.projectPlan.phases.length > 0
        ? parsed.projectPlan.phases
        : this.buildDefaultPhases(order, research),
      risksAndMitigations: parsed.projectPlan?.risksAndMitigations || brainstorm.potentialRisks,
      validationCriteria: parsed.projectPlan?.validationCriteria || [brainstorm.suggestedValidation],
    };
    projectPlan.rawPlanMarkdown = this.formatPlanMarkdown(projectPlan);

    return { brainstorm, projectPlan };
  }

  private generatePlanDeterministic(
    order: OrchestrationOrder,
    research: ResearchResult
  ): { brainstorm: BrainstormResult; projectPlan: ProjectPlan } {
    const targetFiles = research.relevantFiles.slice(0, 6).map((f) => f.relativePath);

    const brainstorm: BrainstormResult = {
      problemSummary: `User request requires implementation of: "${order.orderText}"`,
      architecturalApproach: `Targeting ${research.techStack.join(' + ')} stack. Modify relevant components and implement unit verification.`,
      technicalDecisions: [
        `Preserve established project idioms and structure in ${path.basename(research.projectRoot)}`,
        `Apply changes incrementally in clearly separated phases`,
        `Maintain strict type contracts, schema validations, and zero broken dependencies`,
      ],
      affectedComponents: targetFiles.length > 0 ? targetFiles : ['src/'],
      potentialRisks: [
        'Breaking changes in existing consumers or un-targeted modules',
        'Syntax or dependency runtime incompatibilities',
      ],
      suggestedValidation: research.manifests.includes('package.json') ? 'npm test' : 'Validate compilation and syntax',
    };

    const phases = this.buildDefaultPhases(order, research);

    const projectPlan: ProjectPlan = {
      title: order.title || `Project Plan: ${order.orderText.slice(0, 50)}`,
      summary: `Structured execution plan to build "${order.orderText}" in ${path.basename(research.projectRoot)}.`,
      architecturalReview: `Analysis of ${research.projectRoot} (${research.techStack.join(', ')}). The solution is decoupled into modular phases respecting existing codebase conventions.`,
      technicalDecisions: brainstorm.technicalDecisions,
      phases,
      risksAndMitigations: [
        'Risk: Dependency conflicts — Mitigation: Inspect package manifests before importing new packages',
        'Risk: Regression in existing features — Mitigation: Run test suite and type check after changes',
      ],
      validationCriteria: [
        research.manifests.includes('package.json') ? 'Pass all unit tests with `npm test`' : 'Verify clean execution without runtime errors',
        'Ensure all new public methods and types are fully documented and exported',
      ],
    };
    projectPlan.rawPlanMarkdown = this.formatPlanMarkdown(projectPlan);

    return { brainstorm, projectPlan };
  }

  private buildDefaultPhases(order: OrchestrationOrder, research: ResearchResult): ProjectPlanPhase[] {
    const targetFiles = research.relevantFiles.slice(0, 4).map((f) => f.relativePath);
    return [
      {
        phaseNumber: 1,
        title: 'Architecture & Foundation',
        description: 'Analyze repository context, configure type contracts, schemas, and scaffold dependencies.',
        tasks: [
          'Verify project dependencies and package manifests',
          'Define required data structures, TypeScript interfaces, and configuration schemas',
        ],
        deliverables: ['Interface contracts', 'Scaffolding/module definition'],
      },
      {
        phaseNumber: 2,
        title: 'Core Implementation',
        description: `Implement the primary business logic and functionality for: "${order.orderText}".`,
        tasks: [
          targetFiles.length > 0
            ? `Implement core logic in ${targetFiles.slice(0, 2).join(', ')}`
            : 'Implement core functionality in workspace source files',
          'Wire state management, algorithmic logic, and error handlers',
        ],
        deliverables: ['Working core implementation', 'Updated business logic'],
      },
      {
        phaseNumber: 3,
        title: 'Integration & Verification',
        description: 'Connect modules, verify edge-case handling, and run automated regression tests.',
        tasks: [
          'Validate component integration and type safety',
          research.manifests.includes('package.json') ? 'Execute test suite (npm test)' : 'Verify runtime stability',
        ],
        deliverables: ['Verification report', 'Passing tests and clean diff'],
      },
    ];
  }

  public formatPlanMarkdown(plan: ProjectPlan): string {
    const lines: string[] = [
      `# 📋 ${plan.title}`,
      ``,
      `**Summary**: ${plan.summary}`,
      ``,
      `### 🏛️ Architectural Review & Technical Decisions`,
      `${plan.architecturalReview}`,
      ``,
      ...plan.technicalDecisions.map((d) => `- ${d}`),
      ``,
      `### 🚀 Implementation Phases`,
    ];

    for (const phase of plan.phases) {
      lines.push(
        `#### Phase ${phase.phaseNumber}: ${phase.title}`,
        `${phase.description}`,
        `*Tasks:*`,
        ...phase.tasks.map((t) => `  - ${t}`),
        `*Deliverables:* ${phase.deliverables.join(', ')}`,
        ``
      );
    }

    lines.push(
      `### ⚠️ Risks & Mitigations`,
      ...plan.risksAndMitigations.map((r) => `- ${r}`),
      ``,
      `### ✅ Validation Criteria`,
      ...plan.validationCriteria.map((v) => `- ${v}`)
    );

    return lines.join('\n');
  }

  private async generatePromptViaAI(
    order: OrchestrationOrder,
    research: ResearchResult,
    projectPlan: ProjectPlan,
    brainstorm?: BrainstormResult
  ): Promise<EngineeredPrompt> {
    const systemPrompt = `You are the JARVIS Principal Prompt Engineer.
Based on the developer's approved project plan and codebase context, craft a crystal-clear, highly detailed prompt for an autonomous external coding agent (OpenCode / Kilo Code).
Also synthesize a brief report explaining what the prompt does.

Output MUST be valid JSON matching:
{
  "title": "string",
  "promptText": "string (the complete instruction text with JARVIS DIRECTIVE FOR OPENCODE / KILO CODE)",
  "targetFiles": ["string"],
  "instructions": ["string"],
  "constraints": ["string"],
  "verificationCommand": "string",
  "estimatedComplexity": "LOW" | "MEDIUM" | "HIGH",
  "report": {
    "summary": "string",
    "whatItDoes": "string (brief 1-2 sentence description explaining exactly what OpenCode will do)",
    "targetFiles": ["string"],
    "keyInstructions": ["string"],
    "constraints": ["string"],
    "verificationCommand": "string",
    "estimatedComplexity": "LOW" | "MEDIUM" | "HIGH"
  }
}`;

    const userContent = `Approved Project Plan:
${projectPlan.rawPlanMarkdown || JSON.stringify(projectPlan, null, 2)}

User Directive: "${order.orderText}"
Project Workspace: ${research.projectRoot}
Tech Stack: ${research.techStack.join(', ')}

Relevant Files:
${research.relevantFiles.map((f) => `- ${f.relativePath}`).join('\n')}

Generate the complete prompt and brief prompt report for OpenCode.`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI prompt synthesis timeout')), 6000)
    );

    const res = await Promise.race([
      this.aiService!.generate({
        modelId: 'default',
        routing: { taskType: 'CODING', privacyMode: 'ALLOW_CLOUD' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
      }),
      timeoutPromise,
    ]);

    const parsed = JSON.parse(res.content);
    const targetFiles = parsed.targetFiles || research.relevantFiles.slice(0, 5).map((f) => f.relativePath);

    const report: PromptReport = {
      summary: parsed.report?.summary || `Autonomous code generation for: ${order.orderText}`,
      whatItDoes:
        parsed.report?.whatItDoes ||
        `Instructs OpenCode to execute Phases 1-3 of the project plan, modifying ${targetFiles.join(', ') || 'workspace files'} and verifying with tests.`,
      targetFiles: parsed.report?.targetFiles || targetFiles,
      keyInstructions: parsed.report?.keyInstructions || parsed.instructions || [order.orderText],
      constraints: parsed.report?.constraints || parsed.constraints || ['Maintain repository idioms'],
      verificationCommand: parsed.report?.verificationCommand || parsed.verificationCommand || 'npm test',
      estimatedComplexity: parsed.report?.estimatedComplexity || parsed.estimatedComplexity || 'MEDIUM',
    };

    return {
      title: parsed.title || (order.title || `Task: ${order.orderText.slice(0, 40)}`),
      promptText: parsed.promptText || this.buildDefaultPromptText(order, research, projectPlan),
      targetFiles,
      instructions: parsed.instructions || [order.orderText],
      constraints: parsed.constraints || ['Preserve existing patterns', 'No broken dependencies'],
      verificationCommand: parsed.verificationCommand || 'npm test',
      estimatedComplexity: parsed.estimatedComplexity || 'MEDIUM',
      version: 1,
      report,
    };
  }

  private generatePromptDeterministic(
    order: OrchestrationOrder,
    research: ResearchResult,
    projectPlan: ProjectPlan,
    _brainstorm?: BrainstormResult
  ): EngineeredPrompt {
    const targetFiles = research.relevantFiles.slice(0, 5).map((f) => f.relativePath);
    const promptText = this.buildDefaultPromptText(order, research, projectPlan);

    const report: PromptReport = {
      summary: `Specification to build "${order.orderText}" in ${path.basename(research.projectRoot)}`,
      whatItDoes: `Directs OpenCode to implement the approved ${projectPlan.phases.length}-phase plan across ${targetFiles.length > 0 ? targetFiles.join(', ') : 'workspace modules'}, adhering to existing architectural standards.`,
      targetFiles: targetFiles.length > 0 ? targetFiles : ['src/'],
      keyInstructions: [
        `Implement the requested feature: ${order.orderText}`,
        'Verify syntax and ensure changes compile cleanly',
        'Maintain existing code style and naming conventions',
      ],
      constraints: [
        'Do not remove existing unrelated tests or documentation',
        'Ensure all new functions and types are exported properly',
      ],
      verificationCommand: research.manifests.includes('package.json') ? 'npm test' : undefined,
      estimatedComplexity: 'MEDIUM',
    };

    return {
      title: order.title || `Task: ${order.orderText.slice(0, 50)}`,
      promptText,
      targetFiles,
      instructions: report.keyInstructions,
      constraints: report.constraints,
      verificationCommand: report.verificationCommand,
      estimatedComplexity: 'MEDIUM',
      version: 1,
      report,
    };
  }

  private buildDefaultPromptText(
    order: OrchestrationOrder,
    research: ResearchResult,
    projectPlan?: ProjectPlan
  ): string {
    const phaseSection = projectPlan
      ? [
          `## APPROVED PROJECT PLAN PHASES`,
          ...projectPlan.phases.map(
            (p) =>
              `Phase ${p.phaseNumber} (${p.title}): ${p.description}\nTasks:\n${p.tasks.map((t) => `  - ${t}`).join('\n')}`
          ),
          ``,
        ].join('\n')
      : '';

    return [
      `# JARVIS DIRECTIVE FOR OPENCODE / KILO CODE`,
      `Objective: ${order.orderText}`,
      ``,
      `## REPOSITORY CONTEXT`,
      `- Project Root: ${research.projectRoot}`,
      `- Tech Stack: ${research.techStack.join(', ')}`,
      `- Manifests: ${research.manifests.join(', ')}`,
      ``,
      `## RELEVANT FILES IDENTIFIED`,
      research.relevantFiles.map((f) => `- ${f.relativePath}`).join('\n') ||
        '- None specifically pre-identified; inspect project tree.',
      ``,
      phaseSection,
      `## EXECUTION INSTRUCTIONS`,
      `1. Review the existing implementation in the files listed above.`,
      `2. Implement the solution directly within the workspace with production-grade quality.`,
      `3. Do not modify unrelated files or delete existing comments unless necessary.`,
      `4. Verify your solution before concluding.`,
      ``,
      `Proceed with developing the solution.`,
    ].join('\n');
  }
}

