export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
  CRITICAL: 50,
};

export interface LogContext {
  module?: string;
  taskId?: string;
  sessionId?: string;
  projectId?: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'text' | 'json';
  module?: string;
  context?: LogContext;
  sink?: (formattedMessage: string, record: LogRecord) => void;
}
