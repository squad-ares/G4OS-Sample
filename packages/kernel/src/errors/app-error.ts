import type { ErrorCode } from './error-codes.ts';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

// CR7-12: cap na profundidade do `cause` chain. Sem isso, código que faça
// `JSON.stringify(err)` sobre AppError com causa circular ou cadeia
// muito profunda (ex.: agente A erra → agente B re-wrappa → agent C...)
// pode hang ou exhaust memory. 10 níveis cobrem casos reais com folga.
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
    // CR8-01: a recursão precisa atribuir o resultado de volta. Antes só
    // mutava o WeakSet `seen`, então cadeias profundas ou circulares no
    // nível interno passavam intactas pelo cap.
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
    // CR7-12: trunca/detecta ciclos no cause chain antes de armazenar.
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
