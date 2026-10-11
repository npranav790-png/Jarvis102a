import { LogRecord } from './types.js';

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|secret|token|password|auth|credential|private[_-]?key)/i;
const SENSITIVE_VALUE_PATTERN = /(sk-[a-zA-Z0-9_-]{20,}|gsk_[a-zA-Z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,40}|AQ\.[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36})/g;

/**
 * Recursively redacts sensitive values from objects or strings.
 */
export function redactSecrets(target: unknown): unknown {
  if (typeof target === 'string') {
    return target.replace(SENSITIVE_VALUE_PATTERN, '***REDACTED***');
  }

  if (target === null || typeof target !== 'object') {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map(redactSecrets);
  }

  const cleanObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      cleanObj[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      cleanObj[key] = redactSecrets(value);
    } else if (typeof value === 'string') {
      cleanObj[key] = redactSecrets(value);
    } else {
      cleanObj[key] = value;
    }
  }

  return cleanObj;
}

export function formatLogText(record: LogRecord): string {
  const parts: string[] = [
    `[${record.timestamp}]`,
    `[${record.level.padEnd(7)}]`,
    `[${record.module}]`,
    record.message,
  ];

  if (record.context && Object.keys(record.context).length > 0) {
    const ctxString = Object.entries(record.context)
      .filter(([k]) => k !== 'module')
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    if (ctxString) {
      parts.push(`(${ctxString})`);
    }
  }

  if (record.error) {
    parts.push(`\n  Error: ${record.error.name}: ${record.error.message}`);
    if (record.error.stack) {
      parts.push(`\n${record.error.stack}`);
    }
  }

  return parts.join(' ');
}

export function formatLogJson(record: LogRecord): string {
  return JSON.stringify(record);
}
