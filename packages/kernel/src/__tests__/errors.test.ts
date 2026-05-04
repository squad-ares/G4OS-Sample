import { describe, expect, it } from 'vitest';
import { AgentError } from '../errors/agent-error.ts';
import { AppError } from '../errors/app-error.ts';
import { AuthError } from '../errors/auth-error.ts';
import { CredentialError } from '../errors/credential-error.ts';
import { ErrorCode } from '../errors/error-codes.ts';
import { FsError } from '../errors/fs-error.ts';
import { IpcError } from '../errors/ipc-error.ts';
import { SessionError } from '../errors/session-error.ts';
import { SourceError } from '../errors/source-error.ts';
import { toResult } from '../errors/to-result.ts';

describe('AppError', () => {
  it('toJSON serializes code, message, context without cause', () => {
    const err = new AppError({
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'boom',
      context: { key: 'val' },
    });
    const json = err.toJSON();
    expect(json.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(json.message).toBe('boom');
    expect(json.context).toEqual({ key: 'val' });
    expect('cause' in json).toBe(false);
  });

  it('context is frozen', () => {
    const err = new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' });
    expect(Object.isFrozen(err.context)).toBe(true);
  });

  it('does not mutate the cause chain of the input', () => {
    const inner = new Error('inner');
    const middle = new Error('middle', { cause: inner });
    const outer = new Error('outer', { cause: middle });
    new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x', cause: outer });
    // Cadeia original preservada — caller pode reusar.
    expect((outer as { cause?: unknown }).cause).toBe(middle);
    expect((middle as { cause?: unknown }).cause).toBe(inner);
  });

  it('truncates cause chain past max depth without mutating input', () => {
    // Constrói cadeia de 15 níveis (cap é 10).
    let chain: Error = new Error('leaf');
    const original = chain;
    for (let i = 0; i < 14; i++) chain = new Error(`level-${i}`, { cause: chain });
    const err = new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x', cause: chain });
    // Original ileso.
    expect(chain.cause).toBeDefined();
    // Cause cloned do err atinge o sentinel em algum nível ≤10.
    let cur: unknown = err.cause;
    let depth = 0;
    while (cur && typeof cur === 'object' && 'cause' in cur && (cur as { cause?: unknown }).cause) {
      cur = (cur as { cause?: unknown }).cause;
      depth++;
      if (depth > 12) break;
    }
    expect(depth).toBeLessThanOrEqual(11);
    // Original `chain` ainda alcança `original` por 14 saltos.
    let origCur: unknown = chain;
    let origDepth = 0;
    while (
      origCur &&
      typeof origCur === 'object' &&
      'cause' in origCur &&
      (origCur as { cause?: unknown }).cause
    ) {
      origCur = (origCur as { cause?: unknown }).cause;
      origDepth++;
      if (origDepth > 20) break;
    }
    expect(origCur).toBe(original);
  });

  it('detects circular cause chain and substitutes sentinel in clone (input untouched)', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b') as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    const err = new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x', cause: a });
    // Original cycle preservada.
    expect(a.cause).toBe(b);
    expect(b.cause).toBe(a);
    // Clone recebe sentinel (via toString do Error sentinela).
    let cur: unknown = err.cause;
    let depth = 0;
    let sawSentinel = false;
    while (cur && typeof cur === 'object' && depth < 5) {
      const message = (cur as Error).message;
      if (message?.includes('circular cause chain detected')) sawSentinel = true;
      cur = (cur as { cause?: unknown }).cause;
      depth++;
    }
    expect(sawSentinel).toBe(true);
  });

  it('preserves prototype chain on cloned cause (instanceof works)', () => {
    class CustomError extends Error {
      readonly tag = 'custom' as const;
    }
    const inner = new Error('inner');
    const custom = new CustomError('custom-msg');
    (custom as Error & { cause?: unknown }).cause = inner;
    const err = new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x', cause: custom });
    expect(err.cause).toBeInstanceOf(CustomError);
    expect((err.cause as CustomError).tag).toBe('custom');
  });
});

describe('CredentialError', () => {
  it('notFound factory', () => {
    const err = CredentialError.notFound('api-key');
    expect(err.code).toBe(ErrorCode.CREDENTIAL_NOT_FOUND);
    expect(err.toJSON().context.key).toBe('api-key');
  });

  it('locked factory', () => {
    const err = CredentialError.locked('api-key');
    expect(err.code).toBe(ErrorCode.CREDENTIAL_LOCKED);
  });

  it('decryptFailed factory preserves cause', () => {
    const cause = new Error('decrypt fail');
    const err = CredentialError.decryptFailed('api-key', cause);
    expect(err.cause).toBe(cause);
    expect(err.code).toBe(ErrorCode.CREDENTIAL_DECRYPT_FAILED);
  });
});

describe('AuthError', () => {
  it('notAuthenticated', () => {
    const err = AuthError.notAuthenticated();
    expect(err.code).toBe(ErrorCode.AUTH_NOT_AUTHENTICATED);
    expect(err.toJSON().code).toBe(ErrorCode.AUTH_NOT_AUTHENTICATED);
  });

  it('entitlementRequired includes feature in context', () => {
    const err = AuthError.entitlementRequired('marketplace');
    expect(err.toJSON().context.feature).toBe('marketplace');
  });
});

describe('IpcError', () => {
  it('handlerNotFound includes channel', () => {
    const err = IpcError.handlerNotFound('session:send');
    expect(err.toJSON().context.channel).toBe('session:send');
  });

  it('timeout includes timeoutMs', () => {
    const err = IpcError.timeout('channel', 5000);
    expect(err.toJSON().context.timeoutMs).toBe(5000);
  });
});

describe('SessionError', () => {
  it('notFound includes sessionId', () => {
    const err = SessionError.notFound('sess-1');
    expect(err.toJSON().context.sessionId).toBe('sess-1');
  });
});

describe('AgentError', () => {
  it('rateLimited includes provider', () => {
    const err = AgentError.rateLimited('claude', 30000);
    expect(err.toJSON().context.provider).toBe('claude');
    expect(err.toJSON().context.retryAfterMs).toBe(30000);
  });
});

describe('SourceError', () => {
  it('incompatible includes reason', () => {
    const err = SourceError.incompatible('my-source', 'unsupported version');
    expect(err.toJSON().context.reason).toBe('unsupported version');
  });
});

describe('FsError', () => {
  it('accessDenied includes path', () => {
    const err = FsError.accessDenied('/etc/passwd');
    expect(err.toJSON().context.path).toBe('/etc/passwd');
  });
});

describe('toResult', () => {
  it('wraps resolved promise as ok', async () => {
    const result = await toResult(Promise.resolve(42));
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe(42);
  });

  it('wraps rejected promise as err with AppError', async () => {
    const result = await toResult(Promise.reject(new Error('fail')));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(AppError);
      expect(result.error.code).toBe(ErrorCode.UNKNOWN_ERROR);
    }
  });

  it('passes through AppError unchanged', async () => {
    const original = new AppError({ code: ErrorCode.SESSION_NOT_FOUND, message: 'not found' });
    const result = await toResult(Promise.reject(original));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe(original);
  });
});
