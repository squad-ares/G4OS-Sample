import {
  AgentError,
  AppError,
  AuthError,
  CredentialError,
  ErrorCode,
  FsError,
  IpcError,
  ProjectError,
  SessionError,
  SourceError,
} from '@g4os/kernel/errors';
import { describe, expect, it } from 'vitest';
import { superjson } from '../superjson-setup.ts';

describe('superjson-setup', () => {
  it('roundtrips Date without loss', () => {
    const d = new Date('2026-04-17T12:00:00Z');
    const encoded = superjson.stringify({ d });
    const decoded = superjson.parse<{ d: Date }>(encoded);
    expect(decoded.d).toBeInstanceOf(Date);
    expect(decoded.d.getTime()).toBe(d.getTime());
  });

  it('roundtrips Map and Set', () => {
    const value = { m: new Map([['a', 1]]), s: new Set([1, 2, 3]) };
    const encoded = superjson.stringify(value);
    const decoded = superjson.parse<typeof value>(encoded);
    expect(decoded.m).toBeInstanceOf(Map);
    expect(decoded.m.get('a')).toBe(1);
    expect(decoded.s).toBeInstanceOf(Set);
    expect(decoded.s.has(2)).toBe(true);
  });

  it('preserves CredentialError class identity across the wire', () => {
    const original = new CredentialError({
      code: ErrorCode.CREDENTIAL_NOT_FOUND,
      message: 'not found',
      context: { key: 'anthropic' },
    });
    const encoded = superjson.stringify(original);
    const decoded = superjson.parse<CredentialError>(encoded);
    expect(decoded).toBeInstanceOf(CredentialError);
    expect(decoded.code).toBe(ErrorCode.CREDENTIAL_NOT_FOUND);
    expect(decoded.context).toEqual({ key: 'anthropic' });
  });

  // CR6-01: gate dinâmico — se o kernel ganhar uma subclasse nova de AppError
  // sem registrar em superjson-setup, o `instanceof` quebra silenciosamente
  // no renderer. Cada subclasse exportada precisa ter seu test aqui.
  it.each([
    ['AppError', () => new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'plain' })],
    [
      'CredentialError',
      () => new CredentialError({ code: ErrorCode.CREDENTIAL_NOT_FOUND, message: 'x' }),
    ],
    ['AuthError', () => new AuthError({ code: ErrorCode.AUTH_OTP_INVALID, message: 'x' })],
    ['SessionError', () => new SessionError({ code: ErrorCode.SESSION_NOT_FOUND, message: 'x' })],
    ['AgentError', () => AgentError.network('claude-direct', new Error('boom'))],
    ['SourceError', () => new SourceError({ code: ErrorCode.SOURCE_NOT_FOUND, message: 'x' })],
    ['ProjectError', () => ProjectError.notFound('p1')],
    ['FsError', () => FsError.pathTraversal('../etc/passwd')],
    ['IpcError', () => IpcError.timeout('chan', 5000)],
  ])('preserves %s class identity across the wire', (_label, build) => {
    const original = build();
    const encoded = superjson.stringify(original);
    const decoded = superjson.parse<AppError>(encoded);
    expect(decoded).toBeInstanceOf(original.constructor as typeof AppError);
    expect(decoded.code).toBe((original as AppError).code);
  });
});
