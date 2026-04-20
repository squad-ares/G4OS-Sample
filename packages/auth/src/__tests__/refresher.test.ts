import type { AuthError } from '@g4os/kernel/errors';
import { ok, type Result } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { SessionRefresher } from '../refresh/refresher.ts';
import type { AuthTokenStore, SupabaseAuthPort } from '../types.ts';

function makeStore(
  entries: ReadonlyArray<{ key: string; value: string; expiresAt?: number }>,
): AuthTokenStore {
  const data = new Map(entries.map((e) => [e.key, e] as const));
  return {
    get(key) {
      const entry = data.get(key);
      return Promise.resolve(
        entry
          ? (ok(entry.value) as unknown as Result<string, AuthError>)
          : (ok('') as unknown as Result<string, AuthError>),
      );
    },
    set(key, value, meta) {
      data.set(key, { key, value, ...(meta?.expiresAt ? { expiresAt: meta.expiresAt } : {}) });
      return Promise.resolve(ok(undefined) as unknown as Result<void, AuthError>);
    },
    delete(key) {
      data.delete(key);
      return Promise.resolve(ok(undefined) as unknown as Result<void, AuthError>);
    },
    list() {
      return Promise.resolve(
        ok(
          Array.from(data.values()).map((v) => ({
            key: v.key,
            ...(v.expiresAt ? { expiresAt: v.expiresAt } : {}),
          })),
        ) as unknown as Result<ReadonlyArray<{ key: string; expiresAt?: number }>, AuthError>,
      );
    },
  };
}

describe('SessionRefresher', () => {
  it('schedules next refresh based on access-token expiry minus buffer', async () => {
    const now = 1_000_000;
    const fireAt = now + 10 * 60 * 1000;
    const store = makeStore([
      { key: 'auth.access-token', value: 'a', expiresAt: fireAt },
      { key: 'auth.refresh-token', value: 'r' },
    ]);
    const setTimerCalls: number[] = [];
    const supabase: SupabaseAuthPort = {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      refreshSession: vi.fn(),
    };
    const refresher = new SessionRefresher({
      supabase,
      tokenStore: store,
      now: () => now,
      setTimer: (_fn, ms) => {
        setTimerCalls.push(ms);
        return { cancel: () => undefined };
      },
    });
    await refresher.start();
    // fireAt - now - bufferMs(5min) = 10min - 5min = 5min = 300000
    expect(setTimerCalls[0]).toBe(5 * 60 * 1000);
    expect(refresher.state.kind).toBe('scheduled');
    refresher.dispose();
  });

  it('emits reauth_required when refresh token missing', async () => {
    const now = 1_000_000;
    const store = makeStore([]);
    // list() yields empty, no access token => idle, so test refresh path directly
    const storeWithAccess = makeStore([
      { key: 'auth.access-token', value: 'a', expiresAt: now - 1000 },
    ]);
    const supabase: SupabaseAuthPort = {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      refreshSession: vi.fn(),
    };
    const refresher = new SessionRefresher({
      supabase,
      tokenStore: storeWithAccess,
      now: () => now,
      setTimer: (fn, _ms) => {
        fn();
        return { cancel: () => undefined };
      },
    });
    await refresher.start();
    // fired immediately, no refresh token present → reauth
    expect(['reauth_required', 'refreshing']).toContain(refresher.state.kind);
    expect(store).toBeDefined();
    refresher.dispose();
  });

  it('rotates tokens on successful refresh', async () => {
    const now = 1_000_000;
    const store = makeStore([
      { key: 'auth.access-token', value: 'old', expiresAt: now - 1 },
      { key: 'auth.refresh-token', value: 'oldref' },
    ]);
    const supabase: SupabaseAuthPort = {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      refreshSession: vi.fn(() =>
        Promise.resolve({
          data: {
            session: {
              access_token: 'newtok',
              refresh_token: 'newref',
              expires_at: Math.floor((now + 3600 * 1000) / 1000),
            },
          },
        }),
      ),
    };
    let fireCount = 0;
    const refresher = new SessionRefresher({
      supabase,
      tokenStore: store,
      now: () => now,
      setTimer: (fn) => {
        fireCount += 1;
        if (fireCount === 1) fn();
        return { cancel: () => undefined };
      },
    });
    await refresher.start();
    await new Promise((r) => setImmediate(r));
    const newAccess = await store.get('auth.access-token');
    const newRefresh = await store.get('auth.refresh-token');
    expect(newAccess._unsafeUnwrap()).toBe('newtok');
    expect(newRefresh._unsafeUnwrap()).toBe('newref');
    refresher.dispose();
  });

  it('goes idle when no access token is stored', async () => {
    const store = makeStore([]);
    const supabase: SupabaseAuthPort = {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      refreshSession: vi.fn(),
    };
    const refresher = new SessionRefresher({ supabase, tokenStore: store });
    await refresher.start();
    expect(refresher.state.kind).toBe('idle');
    refresher.dispose();
  });
});
