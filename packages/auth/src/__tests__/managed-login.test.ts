import type { AuthError } from '@g4os/kernel/errors';
import { ok, type Result } from 'neverthrow';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ManagedLoginService } from '../managed-login/service.ts';
import type { AuthTokenStore, SupabaseAuthPort } from '../types.ts';

function makeStore(): AuthTokenStore & {
  readonly data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    get(key) {
      const v = data.get(key);
      return Promise.resolve(
        v === undefined
          ? (ok('') as unknown as Result<string, AuthError>)
          : (ok(v) as unknown as Result<string, AuthError>),
      );
    },
    set(key, value) {
      data.set(key, value);
      return Promise.resolve(ok(undefined) as unknown as Result<void, AuthError>);
    },
    delete(key) {
      data.delete(key);
      return Promise.resolve(ok(undefined) as unknown as Result<void, AuthError>);
    },
    list() {
      return Promise.resolve(
        ok(Array.from(data.keys()).map((k) => ({ key: k }))) as unknown as Result<
          ReadonlyArray<{ key: string; expiresAt?: number }>,
          AuthError
        >,
      );
    },
  };
}

function makePort(overrides: Partial<SupabaseAuthPort> = {}): SupabaseAuthPort {
  return {
    signInWithOtp: vi.fn(() => Promise.resolve({})),
    verifyOtp: vi.fn(() =>
      Promise.resolve({
        data: {
          user: { id: 'u1', email: 'a@b.com' },
          session: { access_token: 'T', refresh_token: 'R', expires_at: 1700000000 },
        },
      }),
    ),
    refreshSession: vi.fn(() => Promise.resolve({ data: {} })),
    ...overrides,
  };
}

describe('ManagedLoginService', () => {
  it('transitions idle → requesting_otp → awaiting_otp on requestOtp', async () => {
    const service = new ManagedLoginService({ supabase: makePort(), tokenStore: makeStore() });
    const result = await service.requestOtp('a@b.com');
    expect(result.isOk()).toBe(true);
    expect(service.state.kind).toBe('awaiting_otp');
  });

  it('transitions through verifying → bootstrapping → authenticated on submitOtp', async () => {
    const bootstrap = { run: vi.fn(() => Promise.resolve()) };
    const store = makeStore();
    const service = new ManagedLoginService({
      supabase: makePort(),
      tokenStore: store,
      bootstrap,
    });
    const result = await service.submitOtp('a@b.com', '123456');
    expect(result.isOk()).toBe(true);
    expect(service.state.kind).toBe('authenticated');
    expect(bootstrap.run).toHaveBeenCalledTimes(1);
    expect(store.data.get('auth.access-token')).toBe('T');
    expect(store.data.get('auth.refresh-token')).toBe('R');
  });

  it('enters error state when OTP verify fails', async () => {
    const port = makePort({
      verifyOtp: vi.fn(() => Promise.resolve({ data: {}, error: { message: 'bad' } })),
    });
    const service = new ManagedLoginService({ supabase: port, tokenStore: makeStore() });
    const result = await service.submitOtp('a@b.com', 'bad');
    expect(result.isErr()).toBe(true);
    expect(service.state.kind).toBe('error');
  });

  it('logout clears tokens and returns to idle', async () => {
    const store = makeStore();
    store.data.set('auth.access-token', 'x');
    store.data.set('auth.refresh-token', 'y');
    const service = new ManagedLoginService({ supabase: makePort(), tokenStore: store });
    await service.logout();
    expect(store.data.size).toBe(0);
    expect(service.state.kind).toBe('idle');
  });

  it('exposes state$ observable with current value', async () => {
    const service = new ManagedLoginService({ supabase: makePort(), tokenStore: makeStore() });
    const first = await firstValueFrom(service.state$);
    expect(first.kind).toBe('idle');
  });
});
