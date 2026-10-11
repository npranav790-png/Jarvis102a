import crypto from 'node:crypto';
import { AudioOutput } from './types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('VoiceCache');

interface CacheEntry {
  audio: AudioOutput;
  expiresAt: number;
}

/**
 * Short-lived in-memory cache for safe, repeated static voice responses (Section 22).
 * Strictly skips caching for dynamic numbers, secrets, personal information, or tool outcomes.
 */
export class VoiceCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number;
  private defaultTtlMs: number;

  constructor(maxEntries = 50, defaultTtlSeconds = 300) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  /**
   * Generates a deterministic cache key.
   */
  private generateKey(text: string, voiceName: string, model: string): string {
    const hash = crypto.createHash('sha256')
      .update(`${model}:${voiceName}:${text.trim().toLowerCase()}`)
      .digest('hex')
      .slice(0, 16);
    return hash;
  }

  /**
   * Determines if a text snippet is safe to cache.
   * Strictly disallows:
   * - Secrets / tokens
   * - Personal data or user-specific IDs
   * - Dynamic system state or timestamps
   * - Security warnings or approval requests
   */
  public isCacheable(text: string): boolean {
    if (!text || text.length > 250) return false;

    // Disallow numbers (likely timestamps, ports, memory stats, percentages)
    if (/\d/.test(text)) return false;

    // Disallow sensitive/dynamic keywords
    const forbiddenPatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /approval/i,
      /warning/i,
      /error/i,
      /risk/i,
      /session/i,
      /user/i,
      /system status/i,
      /cpu/i,
      /ram/i,
      /vram/i,
      /gpu/i,
      /clock/i,
      /time/i,
      /file/i,
      /directory/i,
      /path/i,
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }

    // Only allow short, safe, reusable conversational acknowledgments
    const safePhrases = [
      'at your service',
      'at your service, sir',
      'acknowledged',
      'standing by',
      'good morning',
      'good evening',
      'hello there',
      'i am ready',
      'how may i assist you',
      'how may i help you',
      'listening',
      'ready when you are',
      'yes, sir',
    ];

    const lower = text.trim().toLowerCase().replace(/[.,!]/g, '');
    return safePhrases.some(phrase => lower.includes(phrase));
  }

  public get(text: string, voiceName: string, model: string): AudioOutput | undefined {
    if (!this.isCacheable(text)) return undefined;

    const key = this.generateKey(text, voiceName, model);
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    logger.debug('Voice cache hit', { key });
    return entry.audio;
  }

  public set(text: string, voiceName: string, model: string, audio: AudioOutput, ttlMs?: number): void {
    if (!this.isCacheable(text)) return;

    // Evict oldest if capacity reached
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const key = this.generateKey(text, voiceName, model);
    this.cache.set(key, {
      audio,
      expiresAt: Date.now() + (ttlMs || this.defaultTtlMs),
    });
    logger.debug('Voice cache saved', { key });
  }

  public clear(): void {
    this.cache.clear();
  }
}
