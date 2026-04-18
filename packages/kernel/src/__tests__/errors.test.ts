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
