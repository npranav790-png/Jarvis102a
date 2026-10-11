import { AIService } from '../../providers/ai-service.js';
import { MemoryService, CreateMemoryInput } from './memory-service.js';
import { MemoryItem, MemoryType, MemoryImportance } from '../types.js';
import { MemorySanitizer } from './sanitizer.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('MemoryExtractor');

export class MemoryExtractor {
  constructor(
    private memoryService: MemoryService,
    private aiService?: AIService
  ) {}

  /**
   * Deterministic fast check to see if an interaction is trivial and should yield zero memory.
   */
  public isTrivialInteraction(text: string): boolean {
    if (!text || text.trim().length < 8) return true;

    const lower = text.trim().toLowerCase();
    const trivialPatterns = [
      /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))\b/i,
      /^(what is|calculate|solve|eval)?\s*[\d\s\+\-\*\/\^\(\)\.=]+$/i,
      /^(thanks|thank you|ok|okay|cool|awesome|bye|goodbye)\b/i,
      /^(ping|status|health)\b/i,
    ];

    return trivialPatterns.some(p => p.test(lower));
  }

  /**
   * Extracts durable facts from an interaction and persists them.
   */
  public async extractAndStore(params: {
    userInput: string;
    finalResponse: string;
    projectId?: string | null;
    sessionId?: string | null;
  }): Promise<MemoryItem[]> {
    if (this.isTrivialInteraction(params.userInput)) {
      logger.debug('Skipping memory extraction for trivial interaction.');
      return [];
    }

    const candidates: CreateMemoryInput[] = [];

    // 1. Deterministic heuristic extraction for common preferences/conventions
    const text = `${params.userInput}\n${params.finalResponse}`;

    // Preference detection (e.g. "prefer TypeScript over JavaScript", "prefer python")
    const prefMatch = text.match(/prefer\s+(?:using\s+)?([a-zA-Z0-9_\-\.\#\+]+)(?:\s+(?:over|instead of|to)|\b)/i);
    if (prefMatch && prefMatch[1]) {
      const pref = prefMatch[1].trim();
      if (!MemorySanitizer.containsSensitiveData(pref) && pref.length < 50) {
        candidates.push({
          type: 'USER_PREFERENCE',
          subject: 'User preference',
          predicate: 'prefers',
          content: `User prefers ${pref}`,
          summary: `Prefers ${pref}`,
          importance: 'HIGH',
          projectId: params.projectId,
          sessionId: params.sessionId,
        });
      }
    }

    // Technology stack convention detection
    const techMatch = text.match(/(uses|built with|framework is)\s+([a-zA-Z0-9_\-\.\s]{3,30})/i);
    if (techMatch && techMatch[2]) {
      const tech = techMatch[2].trim();
      if (!MemorySanitizer.containsSensitiveData(tech)) {
        candidates.push({
          type: params.projectId ? 'PROJECT' : 'SEMANTIC',
          subject: 'Technology stack',
          predicate: 'uses',
          content: `Project stack: ${tech}`,
          summary: `Stack: ${tech}`,
          importance: 'NORMAL',
          projectId: params.projectId,
          sessionId: params.sessionId,
        });
      }
    }

    // 2. Persist safe candidates
    const created: MemoryItem[] = [];
    for (const cand of candidates) {
      try {
        const item = await this.memoryService.createMemory(cand);
        created.push(item);
      } catch (err) {
        logger.debug('Candidate skipped or filtered by memory service', err as Record<string, unknown>);
      }
    }

    return created;
  }
}
