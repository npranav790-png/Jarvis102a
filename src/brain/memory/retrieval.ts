import { MemoryItem, MemoryImportance } from '../types.js';

export interface RankedMemory {
  memory: MemoryItem;
  score: number;
  relevanceScore: number;
  importanceScore: number;
  recencyScore: number;
}

export class MemoryRetrievalRanker {
  private static readonly IMPORTANCE_WEIGHTS: Record<MemoryImportance, number> = {
    CRITICAL: 1.0,
    HIGH: 0.8,
    NORMAL: 0.5,
    LOW: 0.2,
  };

  /**
   * Tokenizes text into lowercase normalized word set.
   */
  public static tokenize(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    return new Set(words);
  }

  /**
   * Computes Jaccard similarity between two text snippets (0.0 to 1.0).
   */
  public static computeSimilarity(textA: string, textB: string): number {
    const setA = MemoryRetrievalRanker.tokenize(textA);
    const setB = MemoryRetrievalRanker.tokenize(textB);

    if (setA.size === 0 && setB.size === 0) return 1.0;
    if (setA.size === 0 || setB.size === 0) return 0.0;

    let intersectionCount = 0;
    for (const item of setA) {
      if (setB.has(item)) {
        intersectionCount++;
      }
    }

    const unionSize = setA.size + setB.size - intersectionCount;
    return unionSize === 0 ? 0 : intersectionCount / unionSize;
  }

  /**
   * Computes Cosine similarity between two vector embeddings (0.0 to 1.0).
   */
  public static computeCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
      return 0.0;
    }

    let dot = 0.0;
    let normA = 0.0;
    let normB = 0.0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA <= 0 || normB <= 0) return 0.0;
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(0, Math.min(1.0, similarity));
  }

  /**
   * Ranks candidate memories for a given query, project, and session.
   */
  public static rank(
    query: string,
    candidates: MemoryItem[],
    options?: { targetProjectId?: string | null; maxResults?: number; queryEmbedding?: number[] }
  ): RankedMemory[] {
    const queryTokens = MemoryRetrievalRanker.tokenize(query);
    const now = Date.now();
    const ranked: RankedMemory[] = [];

    for (const mem of candidates) {
      // 1. Cross-Project Isolation Check
      if (options?.targetProjectId !== undefined) {
        if (options.targetProjectId === null) {
          // Looking for global only
          if (mem.projectId !== null) continue;
        } else {
          // Looking for target project OR global
          if (mem.projectId !== null && mem.projectId !== options.targetProjectId) {
            continue;
          }
        }
      }

      // 2. Lexical Relevance Score (0.0 - 1.0)
      const memTokens = MemoryRetrievalRanker.tokenize(`${mem.subject} ${mem.content} ${mem.summary}`);
      let matchCount = 0;
      for (const qt of queryTokens) {
        if (memTokens.has(qt)) {
          matchCount++;
        }
      }
      const lexicalScore = queryTokens.size === 0 ? 0.5 : Math.min(1.0, matchCount / Math.max(1, queryTokens.size));

      // 3. Semantic Vector Score (if queryEmbedding and candidate embedding are present)
      let semanticScore: number | null = null;
      if (options?.queryEmbedding && mem.embedding && options.queryEmbedding.length === mem.embedding.length) {
        semanticScore = MemoryRetrievalRanker.computeCosineSimilarity(options.queryEmbedding, mem.embedding);
      }

      // Hybrid relevance: blend 70% semantic + 30% lexical when vector is available, or 100% lexical otherwise
      const relevanceScore = semanticScore !== null
        ? (semanticScore * 0.7) + (lexicalScore * 0.3)
        : lexicalScore;

      // 3. Importance Score
      const importanceScore = MemoryRetrievalRanker.IMPORTANCE_WEIGHTS[mem.importance] ?? 0.5;

      // 4. Recency Score (Exponential decay over 30 days)
      const createdAtMs = new Date(mem.createdAt).getTime();
      const ageInDays = Math.max(0, (now - createdAtMs) / (1000 * 60 * 60 * 24));
      const recencyScore = Math.exp(-0.05 * ageInDays); // ~0.78 after 5 days, ~0.60 after 10 days

      // 5. Project Affinity Bonus (if memory explicitly matches current project vs global)
      const projectBonus = (options?.targetProjectId && mem.projectId === options.targetProjectId) ? 0.15 : 0;

      // 6. Memory Type Weighting
      const typeWeights: Record<string, number> = {
        'WORKING': 1.0,
        'EPISODIC': 0.6,
        'SEMANTIC': 0.8,
        'PROJECT': 0.9,
        'USER_PREFERENCE': 0.95
      };
      const typeWeight = typeWeights[mem.type] ?? 0.7;

      // 7. Conflict / Verification filtering
      let verificationMultiplier = 1.0;
      if (mem.verificationState === 'VERIFIED') verificationMultiplier = 1.2;
      if (mem.verificationState === 'FAILED' || mem.verificationState === 'UNVERIFIED') verificationMultiplier = 0.5;

      // Total Score: Weighted composite
      const totalScore = (
        (relevanceScore * 0.35) +
        (importanceScore * 0.20) +
        (recencyScore * 0.10) +
        (typeWeight * 0.20) +
        projectBonus
      ) * (mem.confidence || 1.0) * verificationMultiplier;

      // Secret filtering - If memory is marked as containing secrets, decrease rank slightly
      // or rely on the sanitizer layer, but for now we apply a penalty if query doesn't explicitly need it
      const finalScore = mem.containsSecrets ? totalScore * 0.8 : totalScore;

      ranked.push({
        memory: mem,
        score: finalScore,
        relevanceScore,
        importanceScore,
        recencyScore,
      });
    }

    // Sort by score descending
    ranked.sort((a, b) => b.score - a.score);

    // Conflict Resolution: If two memories contradict, prefer the one with a higher score (which accounts for recency and verification)
    const uniqueRanked = [];
    const seenSubjects = new Set<string>();
    
    for (const item of ranked) {
      if (seenSubjects.has(item.memory.subject)) {
        // We already have a higher ranked memory for this exact subject. 
        // This implicitly drops older/unverified conflicting memories.
        continue; 
      }
      seenSubjects.add(item.memory.subject);
      uniqueRanked.push(item);
    }

    const limit = options?.maxResults ?? 15;
    return uniqueRanked.slice(0, limit);
  }
}
