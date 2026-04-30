import type { AuthError } from '@g4os/kernel/errors';
import { ok, type Result } from 'neverthrow';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ManagedLoginService } from '../managed-login/service.ts';
import {
  AUTH_ACCESS_TOKEN_KEY,
  AUTH_SESSION_META_KEY,
  type AuthTokenStore,
  type SupabaseAuthPort,
} from '../types.ts';

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

  // CR12-AU5: invalid transitions / double dispose / post-dispose.
  describe('FSM invariants (CR12-AU5)', () => {
    it('requestOtp pós-dispose retorna AUTH_DISPOSED', async () => {
      const service = new ManagedLoginService({ supabase: makePort(), tokenStore: makeStore() });
      service.dispose();
      const result = await service.requestOtp('a@b.com');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('auth.disposed');
    });

    it('submitOtp pós-dispose retorna AUTH_DISPOSED', async () => {
      const service = new ManagedLoginService({ supabase: makePort(), tokenStore: makeStore() });
      service.dispose();
      const result = await service.submitOtp('a@b.com', '123456');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('auth.disposed');
    });

    it('dispose() é idempotente — chamar 2x não joga', () => {
      const service = new ManagedLoginService({ supabase: makePort(), tokenStore: makeStore() });
      expect(() => {
        service.dispose();
        service.dispose();
      }).not.toThrow();
    });

    it('requestOtp em flight bloqueia segundo requestOtp concorrente', async () => {
      let resolveSignIn: (() => void) | null = null;
      const slowSignIn = vi.fn(
        () =>
          new Promise<Record<string, never>>((r) => {
            resolveSignIn = () => r({});
          }),
      );
      const port = makePort({ signInWithOtp: slowSignIn });
      const service = new ManagedLoginService({ supabase: port, tokenStore: makeStore() });

      const first = service.requestOtp('a@b.com');
      // Primeiro está em `requesting_otp` neste ponto.
      const secondResult = await service.requestOtp('b@c.com');
      expect(secondResult.isErr()).toBe(true);
      if (secondResult.isErr()) expect(secondResult.error.code).toBe('auth.disposed');
      expect(slowSignIn).toHaveBeenCalledTimes(1);

      resolveSignIn?.();
      await first;
    });

    it('submitOtp durante verifying bloqueia segundo submitOtp', async () => {
      let resolveVerify: ((v: { data: Record<string, unknown> }) => void) | null = null;
      const slowVerify = vi.fn(
        () =>
          new Promise<{ data: Record<string, unknown> }>((r) => {
            resolveVerify = r;
          }),
      );
      const port = makePort({ verifyOtp: slowVerify });
      const service = new ManagedLoginService({ supabase: port, tokenStore: makeStore() });

      const first = service.submitOtp('a@b.com', 'first');
      const second = await service.submitOtp('a@b.com', 'second');
      expect(second.isErr()).toBe(true);
      expect(slowVerify).toHaveBeenCalledTimes(1);

      resolveVerify?.({
        data: {
          user: { id: 'u1', email: 'a@b.com' },
          session: { access_token: 'T', refresh_token: 'R', expires_at: 1700000000 },
        },
      });
      await first;
    });

    it('logout pós-dispose não joga (best-effort)', async () => {
      const service = new ManagedLoginService({ supabase: makePort(), tokenStore: makeStore() });
      service.dispose();
      await expect(service.logout()).resolves.toBeUndefined();
    });
  });

  describe('restore() buffer (CR5-25)', () => {
    function seedStore(opts: { expiresAt?: number; access?: string }) {
      const store = makeStore();
      store.data.set(AUTH_ACCESS_TOKEN_KEY, opts.access ?? 'access-T');
      store.data.set(
        AUTH_SESSION_META_KEY,
        JSON.stringify({
          userId: 'u1',
          email: 'a@b.com',
          ...(opts.expiresAt === undefined ? {} : { expiresAt: opts.expiresAt }),
        }),
      );
      return store;
    }

    it('returns false when token expired', async () => {
      const past = Date.now() - 60_000;
      const store = seedStore({ expiresAt: past });
      const service = new ManagedLoginService({ supabase: makePort(), tokenStore: store });
      const restored = await service.restore();
      expect(restored).toBe(false);
      expect(service.state.kind).toBe('idle');
    });

    it('returns false when token within 5min buffer', async () => {
      const insideBuffer = Date.now() + 60_000; // 1min ahead, < 5min buffer
      const store = seedStore({ expiresAt: insideBuffer });
      const service = new ManagedLoginService({ supabase: makePort(), tokenStore: store });
      const restored = await service.restore();
      expect(restored).toBe(false);
    });

    it('returns true when token valid and outside buffer', async () => {
      const future = Date.now() + 60 * 60_000; // 1h ahead, > 5min buffer
      const store = seedStore({ expiresAt: future });
      const service = new ManagedLoginService({ supabase: makePort(), tokenStore: store });
      const restored = await service.restore();
      expect(restored).toBe(true);
      expect(service.state.kind).toBe('authenticated');
    });
  });
});
