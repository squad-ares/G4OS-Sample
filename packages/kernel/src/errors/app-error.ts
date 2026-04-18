import type { ErrorCode } from './error-codes.ts';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly context: Readonly<Record<string, unknown>>;
  override readonly cause: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.cause = options.cause;
    this.context = Object.freeze({ ...(options.context ?? {}) });

    // Preserve stack trace
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** Serialização segura para logs e IPC. Nao inclui cause (pode ter dados sensíveis). */
  toJSON(): { code: ErrorCode; message: string; context: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      context: { ...this.context },
    };
  }
}
