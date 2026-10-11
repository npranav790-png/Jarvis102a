import { ContextBudget, ContextItem, ContextPriority } from '../types.js';

export class ContextBudgetManager {
  private defaultBudget: ContextBudget;

  constructor(defaultBudget?: Partial<ContextBudget>) {
    this.defaultBudget = {
      maxTokens: defaultBudget?.maxTokens ?? 8192,
      maxCharacters: defaultBudget?.maxCharacters ?? 32768,
    };
  }

  /**
   * Estimate token count from string length (rule of thumb: ~4 characters per token).
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Prioritize and truncate items to fit within context budget.
   * Priority order: CRITICAL > HIGH > NORMAL > LOW.
   */
  public fitToBudget(
    items: ContextItem[],
    budgetOverride?: Partial<ContextBudget>
  ): { included: ContextItem[]; truncatedCount: number; totalTokens: number } {
    const budget: ContextBudget = {
      maxTokens: budgetOverride?.maxTokens ?? this.defaultBudget.maxTokens,
      maxCharacters: budgetOverride?.maxCharacters ?? this.defaultBudget.maxCharacters,
    };

    const priorityWeight: Record<ContextPriority, number> = {
      CRITICAL: 4,
      HIGH: 3,
      NORMAL: 2,
      LOW: 1,
    };

    // Sort items by priority descending
    const sorted = [...items].sort(
      (a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]
    );

    const included: ContextItem[] = [];
    let currentTokens = 0;
    let currentChars = 0;
    let truncatedCount = 0;

    for (const item of sorted) {
      const itemTokens = item.tokenEstimate || this.estimateTokens(item.content);
      const itemChars = item.content.length;

      // Always include CRITICAL items even if close to budget, unless completely exceeding
      if (item.priority === 'CRITICAL') {
        included.push(item);
        currentTokens += itemTokens;
        currentChars += itemChars;
        continue;
      }

      if (currentTokens + itemTokens <= budget.maxTokens && currentChars + itemChars <= budget.maxCharacters) {
        included.push(item);
        currentTokens += itemTokens;
        currentChars += itemChars;
      } else {
        truncatedCount++;
      }
    }

    return {
      included,
      truncatedCount,
      totalTokens: currentTokens,
    };
  }
}
