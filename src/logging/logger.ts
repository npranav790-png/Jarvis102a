import { LogContext, LogLevel, LogRecord, LoggerOptions, LOG_LEVEL_PRIORITY } from './types.js';
import { redactSecrets, formatLogJson, formatLogText } from './formatter.js';

export class Logger {
  private level: LogLevel;
  private format: 'text' | 'json';
  private module: string;
  private context: LogContext;
  private sink?: (formattedMessage: string, record: LogRecord) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || 'INFO';
    this.format = options.format || 'text';
    this.module = options.module || 'Core';
    this.context = options.context || {};
    this.sink = options.sink;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public child(childModule: string, additionalContext: LogContext = {}): Logger {
    return new Logger({
      level: this.level,
      format: this.format,
      module: childModule,
      context: { ...this.context, ...additionalContext },
      sink: this.sink,
    });
  }

  public debug(message: string, context?: LogContext): void {
    this.log('DEBUG', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log('INFO', message, context);
  }

  public warn(message: string, context?: LogContext, error?: Error): void {
    this.log('WARNING', message, context, error);
  }

  public error(message: string, context?: LogContext, error?: Error): void {
    this.log('ERROR', message, context, error);
  }

  public critical(message: string, context?: LogContext, error?: Error): void {
    this.log('CRITICAL', message, context, error);
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const mergedContext = { ...this.context, ...(context || {}) };
    const sanitizedContext = redactSecrets(mergedContext) as LogContext;
    const sanitizedMessage = typeof message === 'string' ? redactSecrets(message) as string : String(message);

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      module: mergedContext.module || this.module,
      message: sanitizedMessage,
      context: Object.keys(sanitizedContext).length > 0 ? sanitizedContext : undefined,
      error: error
        ? {
            name: error.name,
            message: redactSecrets(error.message) as string,
            stack: error.stack ? redactSecrets(error.stack) as string : undefined,
          }
        : undefined,
    };

    const formatted = this.format === 'json' ? formatLogJson(record) : formatLogText(record);

    if (this.sink) {
      this.sink(formatted, record);
    } else {
      if (level === 'ERROR' || level === 'CRITICAL') {
        console.error(formatted);
      } else if (level === 'WARNING') {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  }
}

export const rootLogger = new Logger({ module: 'JARVIS' });
