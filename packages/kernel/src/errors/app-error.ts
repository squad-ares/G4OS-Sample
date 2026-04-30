import type { ErrorCode } from './error-codes.ts';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

// Cap na profundidade do `cause` chain — `JSON.stringify` em cadeias
// muito profundas ou circulares pode hang ou exhaust memory. 10 níveis são folga suficiente.
const CAUSE_CHAIN_MAX_DEPTH = 10;

function truncateCauseChain(
  cause: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (cause === null || cause === undefined) return cause;
  if (typeof cause !== 'object') return cause;
  if (seen.has(cause)) {
    return new Error('AppError: circular cause chain detected');
  }
  if (depth >= CAUSE_CHAIN_MAX_DEPTH) {
    return new Error('AppError: cause chain exceeds max depth');
  }
  seen.add(cause);
  const inner = (cause as { cause?: unknown }).cause;
  if (inner !== undefined) {
    // A recursão deve atribuir o resultado de volta — sem isso cadeias profundas
    // no nível interno passavam intactas pelo cap.
    (cause as { cause?: unknown }).cause = truncateCauseChain(inner, seen, depth + 1);
  }
  return cause;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly context: Readonly<Record<string, unknown>>;
  override readonly cause: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    // Trunca/detecta ciclos no cause chain antes de armazenar.
    this.cause = truncateCauseChain(options.cause);
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
