import { UserIntent } from './types.js';
import { TaskType } from '../tasks/types.js';
import { AITaskType } from '../providers/types.js';

export interface IntentClassificationResult {
  intent: UserIntent;
  taskType: TaskType;
  confidence: number;
  isFastPath: boolean;
  reason: string;
}

export function toAITaskType(taskType: TaskType): AITaskType {
  switch (taskType) {
    case 'CODING':
      return 'CODING';
    case 'RESEARCH':
      return 'RESEARCH';
    case 'PLANNING':
      return 'PLANNING';
    case 'AUTOMATION':
      return 'ANALYSIS';
    case 'EXECUTION':
    case 'GENERAL':
    default:
      return 'GENERAL';
  }
}

export class IntentClassifier {
  /**
   * Classifies user intent and maps it to a system TaskType and fast-path indicator.
   */
  public classify(userInput: string): IntentClassificationResult {
    const text = userInput.trim().toLowerCase();

    // 1. Trivial conversational / chit-chat check
    if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|how are you|who are you)\b/i.test(text)) {
      return {
        intent: 'CONVERSATION',
        taskType: 'GENERAL',
        confidence: 0.95,
        isFastPath: true,
        reason: 'Casual conversation or greeting detected.',
      };
    }

    // 2. Simple arithmetic / informational quick lookups
    if (
      /^(what is|calculate|evaluate)?\s*[\d\s\+\-\*\/\^\(\)\.=]+$/i.test(text) ||
      /^define\s+[a-zA-Z\s]{1,30}$/i.test(text) ||
      /^what time is it\b/i.test(text)
    ) {
      return {
        intent: 'INFORMATION',
        taskType: 'GENERAL',
        confidence: 0.9,
        isFastPath: true,
        reason: 'Simple factual lookup or computation; eligible for immediate response.',
      };
    }

    // 3. Coding & Orchestration Intent
    if (
      /\b(opencode|kilobyte|kilo|orchestrate|orchestrator)\b/i.test(text) ||
      /\b(code|function|class|bug|refactor|implement|script|python|typescript|javascript|html|css|sql|api)\b/i.test(text) ||
      /\b(write a program|fix the error|build a cli|develop a solution)\b/i.test(text)
    ) {
      return {
        intent: 'CODING',
        taskType: 'CODING',
        confidence: 0.92,
        isFastPath: false,
        reason: 'Software engineering or OpenCode orchestration request; requires structured plan.',
      };
    }

    // 4. Research Intent
    if (
      /\b(research|compare|investigate|explore|evaluate|benchmark|pros and cons|difference between)\b/i.test(text)
    ) {
      return {
        intent: 'RESEARCH',
        taskType: 'RESEARCH',
        confidence: 0.85,
        isFastPath: false,
        reason: 'Comparative research or deep topic analysis requested.',
      };
    }

    // 5. Automation / Multi-step Workflow
    if (
      /\b(automate|workflow|pipeline|batch|pipeline|schedule|periodically)\b/i.test(text) ||
      text.includes('step 1') ||
      text.includes('and then')
    ) {
      return {
        intent: 'AUTOMATION',
        taskType: 'AUTOMATION',
        confidence: 0.85,
        isFastPath: false,
        reason: 'Multi-step automation workflow requested.',
      };
    }

    // 6. Analysis Intent
    if (
      /\b(analyze|inspect|audit|diagnose|review|examine)\b/i.test(text)
    ) {
      return {
        intent: 'ANALYSIS',
        taskType: 'GENERAL',
        confidence: 0.8,
        isFastPath: false,
        reason: 'System or data analysis requested.',
      };
    }

    // 7. Creation / Planning Intent
    if (
      /\b(plan|create|build|design|draft|architect)\b/i.test(text)
    ) {
      return {
        intent: 'CREATION',
        taskType: 'PLANNING',
        confidence: 0.8,
        isFastPath: false,
        reason: 'Creation or architectural planning requested.',
      };
    }

    // Default: General Information / Action
    return {
      intent: 'INFORMATION',
      taskType: 'GENERAL',
      confidence: 0.6,
      isFastPath: text.length < 50,
      reason: 'Standard request; default general task processing.',
    };
  }
}
