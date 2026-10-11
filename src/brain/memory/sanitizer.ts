import { SensitiveDataDetectedError } from '../../errors/base.js';

export class MemorySanitizer {
  // Regex patterns matching sensitive credentials and tokens
  private static readonly SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9_-]{20,}/i,               // OpenAI / general sk keys
    /gsk_[a-zA-Z0-9_-]{20,}/i,              // Groq API keys
    /AIza[a-zA-Z0-9_\-]{35}/i,              // Google API keys
    /AQ\.[a-zA-Z0-9_-]{20,}/i,              // Google AI Studio modern keys
    /ghp_[a-zA-Z0-9]{36}/i,                 // GitHub Personal Access Token
    /gho_[a-zA-Z0-9]{36}/i,                 // GitHub OAuth Token
    /xox[baprs]-[0-9a-zA-Z-]{10,}/i,        // Slack tokens
    /bearer\s+[a-zA-Z0-9_\-\.]{25,}/i,      // Bearer JWT tokens
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/i, // Private keys
    /("password"|'password'|password)\s*[:=]\s*["'][^"']+["']/i, // Plaintext password assignments
  ];

  /**
   * Scans text for credentials, keys, or passwords.
   * If detected, throws a SensitiveDataDetectedError.
   */
  public static assertSafeForMemory(content: string, fieldName: string = 'content'): void {
    if (!content) return;

    for (const pattern of MemorySanitizer.SECRET_PATTERNS) {
      if (pattern.test(content)) {
        throw new SensitiveDataDetectedError(
          `Detected potential API key, authentication token, or secret in ${fieldName}. Storing secrets in memory is strictly forbidden.`
        );
      }
    }
  }

  /**
   * Returns true if text contains sensitive data patterns.
   */
  public static containsSensitiveData(content: string): boolean {
    if (!content) return false;
    return MemorySanitizer.SECRET_PATTERNS.some(p => p.test(content));
  }

  /**
   * Replaces detected credentials, keys, or passwords with [REDACTED].
   */
  public static redactSecrets(content: string): string {
    if (!content) return '';
    let sanitized = content;
    for (const pattern of MemorySanitizer.SECRET_PATTERNS) {
      sanitized = sanitized.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'), '[REDACTED_SECRET]');
    }
    return sanitized;
  }
}

