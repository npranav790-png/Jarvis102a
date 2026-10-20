import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('EmbeddingService');

export interface EmbeddingOptions {
  apiKey?: string;
  ollamaBaseUrl?: string;
  model?: string;
}

export class EmbeddingService {
  private apiKey?: string;
  private ollamaBaseUrl: string;
  private model: string;

  constructor(options: EmbeddingOptions = {}) {
    this.apiKey =
      options.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_AI_API_KEY;
    this.ollamaBaseUrl = (options.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.model = options.model || process.env.EMBEDDING_MODEL || 'text-embedding-004';
  }

  /**
   * Generates a 768-dimensional or normalized embedding vector for text.
   * Priority: Google text-embedding-004 (Free Tier) -> Ollama nomic-embed-text -> Deterministic N-Gram fallback.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return new Array(64).fill(0);
    }

    const clean = text.trim();

    // 1. Google Gemini Cloud Free-Tier Embeddings (text-embedding-004)
    if (this.apiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${encodeURIComponent(this.apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${this.model}`,
            content: { parts: [{ text: clean }] },
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const data = await res.json() as { embedding?: { values?: number[] } };
          if (data.embedding?.values && Array.isArray(data.embedding.values)) {
            return data.embedding.values;
          }
        }
      } catch (err: any) {
        logger.debug(`Gemini cloud embedding failed, trying local Ollama: ${err.message}`);
      }
    }

    // 2. Local Ollama Embeddings (nomic-embed-text or all-minilm)
    try {
      const res = await fetch(`${this.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: clean,
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok) {
        const data = await res.json() as { embedding?: number[] };
        if (data.embedding && Array.isArray(data.embedding)) {
          return data.embedding;
        }
      }
    } catch {
      // Ollama offline / unreachable
    }

    // 3. High-Speed Deterministic Hashed Bag-of-Words Embedding Fallback
    // Guarantees consistent vector dimensions (64-dim unit vector) in test and isolated modes
    return EmbeddingService.generateDeterministicVector(clean, 64);
  }

  /**
   * Fast, deterministic 64-dimensional normalized vector for offline/mock operations.
   */
  public static generateDeterministicVector(text: string, dimensions = 64): number[] {
    const vec = new Array(dimensions).fill(0);
    const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = (hash << 5) - hash + word.charCodeAt(j);
        hash |= 0;
      }
      const idx = Math.abs(hash) % dimensions;
      const weight = 2.0 / Math.sqrt(i + 1);
      vec[idx] += weight;

      // Subword character 3-grams for morphological and root similarity
      if (word.length >= 3) {
        for (let k = 0; k <= word.length - 3; k++) {
          const trigram = word.substring(k, k + 3);
          let triHash = 0;
          for (let m = 0; m < 3; m++) {
            triHash = (triHash << 5) - triHash + trigram.charCodeAt(m);
            triHash |= 0;
          }
          vec[Math.abs(triHash) % dimensions] += 0.5;
        }
      }
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) vec[i] /= norm;
    }

    return vec;
  }
}
