import { Injectable, LoggerService as NestLoggerService } from "@nestjs/common";

export interface LogContext {
  service?: string;
  method?: string;
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger = console;

  log(message: string, context?: LogContext) {
    const logEntry = this.formatLogEntry("INFO", message, context);
    this.logger.log(logEntry);
  }

  error(message: string, trace?: string, context?: LogContext) {
    const logEntry = this.formatLogEntry("ERROR", message, context, trace);
    this.logger.error(logEntry);
  }

  warn(message: string, context?: LogContext) {
    const logEntry = this.formatLogEntry("WARN", message, context);
    this.logger.warn(logEntry);
  }

  debug(message: string, context?: LogContext) {
    const logEntry = this.formatLogEntry("DEBUG", message, context);
    this.logger.debug(logEntry);
  }

  verbose(message: string, context?: LogContext) {
    const logEntry = this.formatLogEntry("VERBOSE", message, context);
    this.logger.log(logEntry);
  }

  private formatLogEntry(
    level: string,
    message: string,
    context?: LogContext,
    trace?: string
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : "";
    const traceStr = trace ? ` | Trace: ${trace}` : "";

    return `[${timestamp}] ${level}: ${message}${contextStr}${traceStr}`;
  }

  // 비즈니스 로직 전용 로깅 메서드들
  logAuthEvent(event: string, userId?: string, details?: any) {
    this.log(`Auth Event: ${event}`, {
      service: "AuthService",
      userId,
      ...details,
    });
  }

  logTokenEvent(event: string, walletId?: number, details?: any) {
    this.log(`Token Event: ${event}`, {
      service: "TokenService",
      walletId,
      ...details,
    });
  }

  logDatabaseQuery(query: string, duration?: number, context?: LogContext) {
    this.log(`Database Query: ${query}`, {
      service: "Database",
      duration: `${duration}ms`,
      ...context,
    });
  }
}
