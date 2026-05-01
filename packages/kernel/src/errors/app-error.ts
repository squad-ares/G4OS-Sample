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
  if (inner === undefined) return cause;
  // Clonamos preservando o protótipo (`instanceof CustomError` continua valendo) e
  // substituímos `cause` no clone — nunca mutamos o input. Caller pode reter referência
  // para o original; mutar quebraria cadeias compartilhadas (Sentry breadcrumb capture,
  // retry logic, error-bus) e, numa 2ª passada, faria `seen` retornar `circular` por
  // falsa positiva.
  const clone = Object.create(Object.getPrototypeOf(cause));
  for (const key of Reflect.ownKeys(cause)) {
    const descriptor = Object.getOwnPropertyDescriptor(cause, key);
    if (descriptor) Object.defineProperty(clone, key, descriptor);
  }
  (clone as { cause?: unknown }).cause = truncateCauseChain(inner, seen, depth + 1);
  return clone;
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
