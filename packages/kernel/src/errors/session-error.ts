import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

export class SessionError extends AppError {
  constructor(
    options: Omit<AppErrorOptions, 'code'> & { code: Extract<ErrorCode, `session.${string}`> },
  ) {
    super(options);
    this.name = 'SessionError';
  }

  static notFound(sessionId: string): SessionError {
    return new SessionError({
      code: ErrorCode.SESSION_NOT_FOUND,
      message: `Session not found: ${sessionId}`,
      context: { sessionId },
    });
  }

  static corrupted(sessionId: string, cause?: unknown): SessionError {
    return new SessionError({
      code: ErrorCode.SESSION_CORRUPTED,
      message: `Session data corrupted: ${sessionId}`,
      context: { sessionId },
      cause,
    });
  }

  static locked(sessionId: string): SessionError {
    return new SessionError({
      code: ErrorCode.SESSION_LOCKED,
      message: `Session is locked: ${sessionId}`,
      context: { sessionId },
    });
  }
}
