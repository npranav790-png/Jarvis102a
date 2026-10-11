import {
  ContextItem,
  ContextBudget,
  AssembledContext,
  UserIntent,
  ReasoningMode,
  MemoryItem,
} from '../types.js';
import { ContextBudgetManager } from './budget.js';
import { PromptManager } from './prompt-manager.js';
import { ProjectManager } from '../../projects/manager.js';
import { SessionManager } from '../../sessions/manager.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('ContextEngine');

export interface AssembleContextOptions {
  userInput: string;
  intent: UserIntent;
  reasoningMode: ReasoningMode;
  projectId?: string;
  sessionId?: string;
  memories?: MemoryItem[];
  constraints?: string[];
  untrustedContent?: string;
  budgetOverride?: Partial<ContextBudget>;
}

export class ContextEngine {
  private budgetManager: ContextBudgetManager;
  private promptManager: PromptManager;

  constructor(
    private projectManager: ProjectManager,
    private sessionManager: SessionManager,
    defaultBudget?: Partial<ContextBudget>
  ) {
    this.budgetManager = new ContextBudgetManager(defaultBudget);
    this.promptManager = new PromptManager();
  }

  /**
   * Assembles a complete, budget-constrained context for the AI Intelligence layer.
   */
  public assembleContext(options: AssembleContextOptions): AssembledContext {
    logger.debug(`Assembling context for intent: ${options.intent} [mode=${options.reasoningMode}]`);

    const rawItems: ContextItem[] = [];

    // 1. User Input (CRITICAL priority)
    rawItems.push({
      id: 'ctx_user_input',
      category: 'USER',
      priority: 'CRITICAL',
      content: options.userInput,
      tokenEstimate: this.budgetManager.estimateTokens(options.userInput),
    });

    // 2. Active Project Context (HIGH priority)
    let projectContextStr = '';
    if (options.projectId) {
      try {
        const project = this.projectManager.getProject(options.projectId);
        projectContextStr = `Active Project: "${project.name}" (ID: ${project.id})\nRoot Path: ${project.rootPath}\nDescription: ${project.description || 'None'}`;
        rawItems.push({
          id: 'ctx_project',
          category: 'PROJECT',
          priority: 'HIGH',
          content: projectContextStr,
          tokenEstimate: this.budgetManager.estimateTokens(projectContextStr),
        });
      } catch (err) {
        logger.warn(`Could not resolve project for context: ${options.projectId}`, err as Record<string, unknown>);
      }
    }

    // 3. Active Session Context (NORMAL priority)
    if (options.sessionId) {
      try {
        const session = this.sessionManager.getSession(options.sessionId);
        const sessionSummary = `Session: "${session.title}" (ID: ${session.id})`;
        rawItems.push({
          id: 'ctx_session',
          category: 'SYSTEM',
          priority: 'NORMAL',
          content: sessionSummary,
          tokenEstimate: this.budgetManager.estimateTokens(sessionSummary),
        });
      } catch (err) {
        logger.warn(`Could not resolve session for context: ${options.sessionId}`, err as Record<string, unknown>);
      }
    }

    // 4. Stored Memories Context (Categorized by memory importance)
    const includedMemories: MemoryItem[] = [];
    if (options.memories && options.memories.length > 0) {
      for (const mem of options.memories) {
        const memPriority =
          mem.importance === 'CRITICAL'
            ? 'CRITICAL'
            : mem.importance === 'HIGH'
            ? 'HIGH'
            : mem.importance === 'LOW'
            ? 'LOW'
            : 'NORMAL';

        const memStr = `[${mem.type}] ${mem.verificationState ? `(State: ${mem.verificationState}) ` : ''}${mem.subject ? `${mem.subject}: ` : ''}${mem.content}`;

        rawItems.push({
          id: `ctx_mem_${mem.id}`,
          category: 'MEMORY',
          priority: memPriority,
          content: memStr,
          tokenEstimate: this.budgetManager.estimateTokens(memStr),
        });
      }
    }

    // 5. Untrusted External / Tool Content (LOW priority)
    if (options.untrustedContent) {
      rawItems.push({
        id: 'ctx_untrusted',
        category: 'UNTRUSTED',
        priority: 'LOW',
        content: options.untrustedContent,
        tokenEstimate: this.budgetManager.estimateTokens(options.untrustedContent),
        untrusted: true,
      });
    }

    // Fit to budget
    const { included, truncatedCount, totalTokens } = this.budgetManager.fitToBudget(
      rawItems,
      options.budgetOverride
    );

    // Group included memories
    const includedMemIds = new Set(
      included.filter(i => i.category === 'MEMORY').map(i => i.id.replace('ctx_mem_', ''))
    );
    if (options.memories) {
      for (const m of options.memories) {
        if (includedMemIds.has(m.id)) {
          includedMemories.push(m);
        }
      }
    }

    // Build memory context string
    const memoryContextStr = included
      .filter(i => i.category === 'MEMORY')
      .map(i => `- ${i.content}`)
      .join('\n');

    // Build prompt via PromptManager
    const prompts = this.promptManager.buildPrompt({
      intent: options.intent,
      reasoningMode: options.reasoningMode,
      projectContext: projectContextStr,
      memoryContext: memoryContextStr,
      userPrompt: options.userInput,
      untrustedContent: options.untrustedContent,
      constraints: options.constraints,
    });

    return {
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      tokenEstimate: totalTokens,
      truncatedCount,
      includedMemories,
    };
  }

  public getPromptManager(): PromptManager {
    return this.promptManager;
  }

  public getBudgetManager(): ContextBudgetManager {
    return this.budgetManager;
  }
}
