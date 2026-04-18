import { CredentialError, ErrorCode } from '@g4os/kernel/errors';
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
});
