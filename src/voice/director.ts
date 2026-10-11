import {
  VoiceEmotion,
  VoiceStyle,
  VoicePacing,
  VoiceEnergy,
  VoiceDirection
} from './types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('VoiceDirector');

/**
 * Centralized JARVIS Voice Style Instruction (Section 7).
 * Single source of truth for vocal persona and delivery characteristics.
 */
export const JARVIS_VOICE_STYLE_PROMPT = `You are JARVIS, a sophisticated personal AI assistant.
Speak with calm authority, precise diction, subtle warmth, and restrained confidence.
Maintain natural conversational pacing.
Do not sound robotic.
Do not over-emphasize words.
Do not sound excessively excited.
Use subtle emotional variation when context requires it.
For urgent situations, become concise and serious.
For successful tasks, sound quietly confident.
For humorous situations, use restrained dry humor.
Never exaggerate emotion.`;

export interface DirectionContext {
  userPrompt?: string;
  hasTasks?: boolean;
  taskStatus?: 'success' | 'failed' | 'pending';
  isSecurityWarning?: boolean;
  requiresApproval?: boolean;
  isError?: boolean;
  isHumor?: boolean;
  isStatusCheck?: boolean;
  metadata?: Record<string, unknown>;
}

export class VoiceDirector {
  private defaultVoiceName: string;

  constructor(defaultVoiceName = 'Charon') {
    this.defaultVoiceName = defaultVoiceName;
  }

  /**
   * Directs the speech output: sanitizes response text, analyzes semantic context,
   * determines emotion, style, pacing, and speech viability without altering factual content.
   */
  public direct(rawText: string, context: DirectionContext = {}): VoiceDirection {
    if (!rawText || rawText.trim().length === 0) {
      return {
        shouldSpeak: false,
        reason: 'Empty text payload',
        emotion: 'NEUTRAL',
        style: 'PROFESSIONAL',
        pacing: 'NORMAL',
        energy: 'CONTROLLED',
        emphasisWords: [],
        speechText: '',
        originalText: '',
        voiceName: this.defaultVoiceName,
        speedMultiplier: 1.0,
        pitchAdjustment: 0.0,
      };
    }

    // 1. Sanitize text for speech (Section 8)
    const sanitizedText = this.sanitizeForSpeech(rawText);

    // 2. Determine whether this response should be spoken aloud
    const shouldSpeak = this.determineShouldSpeak(rawText, sanitizedText);
    if (!shouldSpeak) {
      return {
        shouldSpeak: false,
        reason: 'Non-conversational or purely tabular/code payload',
        emotion: 'NEUTRAL',
        style: 'PROFESSIONAL',
        pacing: 'NORMAL',
        energy: 'CONTROLLED',
        emphasisWords: [],
        speechText: sanitizedText,
        originalText: rawText,
        voiceName: this.defaultVoiceName,
        speedMultiplier: 1.0,
        pitchAdjustment: 0.0,
      };
    }

    // 3. Determine emotion and delivery style from content and context (Section 5)
    const { emotion, style, pacing, energy, speedMultiplier, pitchAdjustment } =
      this.evaluateEmotionAndStyle(sanitizedText, context);

    // 4. Identify emphasis words
    const emphasisWords = this.extractEmphasisWords(sanitizedText);

    // 5. Structure speech text with natural pacing pauses (commas/dashes) while strictly preserving meaning
    const speechText = this.applyPacingPauses(sanitizedText, pacing, emotion);

    return {
      shouldSpeak: true,
      emotion,
      style,
      pacing,
      energy,
      emphasisWords,
      speechText,
      originalText: rawText,
      voiceName: this.defaultVoiceName,
      speedMultiplier,
      pitchAdjustment,
    };
  }

  /**
   * Evaluates emotional state and delivery style based on context and textual sentiment.
   * Never makes the voice randomly emotional; strictly context-driven.
   */
  public evaluateEmotionAndStyle(
    text: string,
    context: DirectionContext
  ): {
    emotion: VoiceEmotion;
    style: VoiceStyle;
    pacing: VoicePacing;
    energy: VoiceEnergy;
    speedMultiplier: number;
    pitchAdjustment: number;
  } {
    const lower = text.toLowerCase();
    const promptLower = (context.userPrompt || '').toLowerCase();

    // 1. Emergency / Critical Failure / Immediate Threat
    if (
      context.isError ||
      lower.includes('emergency') ||
      lower.includes('critical failure') ||
      lower.includes('breach detected') ||
      lower.includes('catastrophic') ||
      lower.includes('immediate danger')
    ) {
      return {
        emotion: 'URGENT',
        style: 'SERIOUS',
        pacing: 'BRISK',
        energy: 'HIGH',
        speedMultiplier: 1.1,
        pitchAdjustment: 0.0,
      };
    }

    // 2. Security Warning / Approval Required
    if (
      context.isSecurityWarning ||
      context.requiresApproval ||
      (!context.isStatusCheck && (
        lower.includes('requires your approval') ||
        lower.includes('security warning') ||
        lower.includes('access restricted') ||
        lower.includes('unauthorized') ||
        lower.includes('high risk') ||
        lower.includes('destructive action')
      ))
    ) {
      return {
        emotion: 'CONCERNED',
        style: 'SERIOUS',
        pacing: 'SLOW',
        energy: 'CONTROLLED',
        speedMultiplier: 0.95,
        pitchAdjustment: -0.05,
      };
    }

    // 3. Humorous Request / Witty banter
    if (
      context.isHumor ||
      promptLower.includes('joke') ||
      promptLower.includes('funny') ||
      promptLower.includes('who are you') ||
      lower.includes('humor') ||
      lower.includes('amusing') ||
      lower.includes('iron man') ||
      lower.includes('tony stark')
    ) {
      return {
        emotion: 'AMUSED',
        style: 'DRY_HUMOR',
        pacing: 'NORMAL',
        energy: 'CONTROLLED',
        speedMultiplier: 1.0,
        pitchAdjustment: 0.02,
      };
    }

    // 4. Successful Task / Mission Completed
    if (
      context.taskStatus === 'success' ||
      context.hasTasks ||
      lower.includes('successfully completed') ||
      lower.includes('task completed') ||
      lower.includes('build succeeded') ||
      lower.includes('all tests pass') ||
      lower.includes('operation complete')
    ) {
      return {
        emotion: 'CONFIDENT',
        style: 'PROFESSIONAL',
        pacing: 'NORMAL',
        energy: 'CONTROLLED',
        speedMultiplier: 1.02,
        pitchAdjustment: 0.0,
      };
    }

    // 5. System Status Check / Diagnostics / Operational baseline
    if (
      context.isStatusCheck ||
      promptLower.includes('status') ||
      promptLower.includes('diagnostics') ||
      promptLower.includes('system') ||
      lower.includes('system status') ||
      lower.includes('all systems operational') ||
      lower.includes('operational status') ||
      lower.includes('online and ready')
    ) {
      return {
        emotion: 'CALM',
        style: 'PROFESSIONAL',
        pacing: 'NORMAL',
        energy: 'CONTROLLED',
        speedMultiplier: 1.0,
        pitchAdjustment: 0.0,
      };
    }

    // 6. User Concern / Reassurance / Assistance
    if (
      promptLower.includes('worried') ||
      promptLower.includes('problem') ||
      lower.includes('don\'t worry') ||
      lower.includes('rest assured') ||
      lower.includes('at your service') ||
      lower.includes('glad to assist')
    ) {
      return {
        emotion: 'WARM',
        style: 'REASSURING',
        pacing: 'SLOW',
        energy: 'CONTROLLED',
        speedMultiplier: 0.98,
        pitchAdjustment: 0.01,
      };
    }

    // 7. Technical Data / Architecture / Code Analysis
    if (
      lower.includes('algorithm') ||
      lower.includes('latency') ||
      lower.includes('memory') ||
      lower.includes('bandwidth') ||
      lower.includes('gigabytes') ||
      lower.includes('megabytes') ||
      lower.includes('kilobytes') ||
      lower.includes('configuration') ||
      lower.includes('parameters') ||
      lower.includes('telemetry')
    ) {
      return {
        emotion: 'NEUTRAL',
        style: 'TECHNICAL',
        pacing: 'NORMAL',
        energy: 'CONTROLLED',
        speedMultiplier: 1.0,
        pitchAdjustment: 0.0,
      };
    }

    // 8. General Conversational Default: Calm & Articulate
    return {
      emotion: 'CALM',
      style: 'CONVERSATIONAL',
      pacing: 'NORMAL',
      energy: 'CONTROLLED',
      speedMultiplier: 1.0,
      pitchAdjustment: 0.0,
    };
  }

  /**
   * Sanitizes raw text into clean, fluent speech (Section 8).
   * Strips markdown, code blocks, secrets, URLs, and converts markdown lists.
   */
  public sanitizeForSpeech(raw: string): string {
    if (!raw) return '';

    let text = raw;

    // 1. Remove internal reasoning / chain-of-thought tags
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');

    // 2. Remove internal tool calls or debug blocks
    text = text.replace(/\[tool_call:[^\]]+\]/gi, '');
    text = text.replace(/\{"tool":\s*"[^"]+".*?\}/gi, '');

    // 3. Remove stack traces and debug lines
    text = text.replace(/at\s+[\w.<>$]+\s+\([^)]+\)/g, '');
    text = text.replace(/^\s*at\s+.*$/gm, '');

    // 4. Redact API keys and secrets
    text = text.replace(/AQ\.[a-zA-Z0-9_-]{20,}/g, 'API key redacted');
    text = text.replace(/AIza[0-9A-Za-z-_]{35}/g, 'API key redacted');
    text = text.replace(/sk-[a-zA-Z0-9]{20,}/g, 'Secret key redacted');
    text = text.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, 'Bearer token redacted');

    // 5. Convert code blocks into natural speech notice
    text = text.replace(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/g, (_match, _code) => {
      return ' [Code block omitted for speech] ';
    });

    // 6. Convert inline code `foo` -> foo
    text = text.replace(/`([^`]+)`/g, '$1');

    // 7. Convert markdown links [Label](url) -> Label
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 8. Clean raw URLs (e.g. https://example.com/path -> example.com)
    text = text.replace(/https?:\/\/([a-zA-Z0-9\.-]+)(?:\/[^\s]*)?/g, '$1');

    // 9. Remove raw JSON blocks that might leak
    text = text.replace(/\{[\s\r\n]*"[a-zA-Z0-9_]+":[\s\S]*?\}/g, '');

    // 10. Convert markdown bullet lists to natural spoken lists (Section 8)
    // E.g.:
    // - CPU
    // - RAM
    // - GPU
    // -> "CPU, RAM, and GPU."
    text = this.convertMarkdownListsToSpeech(text);

    // 11. Remove markdown headers
    text = text.replace(/^#{1,6}\s+/gm, '');

    // 12. Remove bold / italic markers
    text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');

    // 13. Remove remaining markdown artifacts (blockquotes, horizontal rules)
    text = text.replace(/^>\s+/gm, '');
    text = text.replace(/^---+\s*$/gm, '');

    // 14. Normalize whitespace
    text = text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Converts markdown bullet lists to natural conversational speech.
   * Example:
   * "- CPU
   *  - RAM
   *  - GPU"
   * becomes "CPU, RAM, and GPU."
   */
  private convertMarkdownListsToSpeech(text: string): string {
    const lines = text.split('\n');
    const processedLines: string[] = [];
    let currentList: string[] = [];

    const flushList = () => {
      if (currentList.length === 0) return;
      if (currentList.length === 1) {
        processedLines.push(currentList[0] + '.');
      } else if (currentList.length === 2) {
        processedLines.push(`${currentList[0]}, and ${currentList[1]}.`);
      } else {
        const last = currentList.pop();
        processedLines.push(`${currentList.join(', ')}, and ${last}.`);
      }
      currentList = [];
    };

    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[\*\-]\s+(.+)$/);
      if (bulletMatch) {
        const itemText = bulletMatch[1].trim().replace(/[.;,]$/, '');
        currentList.push(itemText);
      } else {
        flushList();
        processedLines.push(line);
      }
    }
    flushList();

    return processedLines.join('\n');
  }

  /**
   * Determines whether the synthesized output should be spoken aloud.
   * Returns false if text is empty, purely code, purely binary, or system silence.
   */
  private determineShouldSpeak(raw: string, sanitized: string): boolean {
    if (!sanitized || sanitized.trim().length === 0) return false;
    // Purely a code block
    if (sanitized === '[Code block omitted for speech]' && raw.trim().startsWith('```') && raw.trim().endsWith('```')) {
      return false;
    }
    // Extremely short trivial non-words
    if (/^[^\w\s]+$/.test(sanitized)) return false;
    return true;
  }

  /**
   * Extracts prominent words for speech emphasis without altering content.
   */
  private extractEmphasisWords(text: string): string[] {
    const emphasis: string[] = [];
    const matches = text.match(/\b([A-Z]{2,}|important|critical|warning|complete|ready|offline|online)\b/gi);
    if (matches) {
      for (const m of matches) {
        const word = m.trim();
        if (word.length > 2 && !emphasis.includes(word)) {
          emphasis.push(word);
        }
      }
    }
    return emphasis;
  }

  /**
   * Applies subtle punctuation pauses for pacing (Section 5).
   * Factually identical; adjusts flow for natural phrasing.
   */
  private applyPacingPauses(text: string, pacing: VoicePacing, emotion: VoiceEmotion): string {
    if (pacing === 'SLOW' || emotion === 'CONCERNED' || emotion === 'WARM') {
      // Subtly ensure sentences have clear breath marks
      return text.replace(/([.!?])\s+/g, '$1... ');
    }
    return text;
  }
}
