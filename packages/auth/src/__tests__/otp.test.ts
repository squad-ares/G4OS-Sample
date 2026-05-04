import { describe, expect, it, vi } from 'vitest';
import { sendOtp, verifyOtp } from '../otp/otp-flow.ts';
import type { SupabaseAuthPort } from '../types.ts';

function makePort(overrides: Partial<SupabaseAuthPort> = {}): SupabaseAuthPort {
  return {
    signInWithOtp: vi.fn(() => Promise.resolve({})),
    verifyOtp: vi.fn(() =>
      Promise.resolve({
        data: {
          user: { id: 'u1', email: 'planuze@gmail.com' },
          session: {
            access_token: 'tok',
            refresh_token: 'ref',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
      }),
    ),
    refreshSession: vi.fn(() => Promise.resolve({ data: {} })),
    ...overrides,
  };
}

describe('sendOtp', () => {
  it('normalizes email and calls Supabase with shouldCreateUser:true', async () => {
    const port = makePort();
    const result = await sendOtp(port, '  Planuze@Gmail.Com  ');
    expect(result.isOk()).toBe(true);
    expect(port.signInWithOtp).toHaveBeenCalledWith({
      email: 'planuze@gmail.com',
      shouldCreateUser: true,
    });
  });

  it('returns AuthError on supabase error', async () => {
    const port = makePort({
      signInWithOtp: vi.fn(() => Promise.resolve({ error: { message: 'rate limited' } })),
    });
    const result = await sendOtp(port, 'a@b.com');
    expect(result.isErr()).toBe(true);
  });
});

describe('verifyOtp', () => {
  it('succeeds on first try with type=email', async () => {
    const port = makePort();
    const result = await verifyOtp(port, 'a@b.com', '123456');
    expect(result.isOk()).toBe(true);
    expect(port.verifyOtp).toHaveBeenCalledTimes(1);
    expect(result._unsafeUnwrap().accessToken).toBe('tok');
  });

  it('falls back to type=signup when email verify fails with invalid hint', async () => {
    let call = 0;
    const port = makePort({
      verifyOtp: vi.fn(() => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({ data: {}, error: { message: 'Token is invalid' } });
        }
        return Promise.resolve({
          data: {
            user: { id: 'u2' },
            session: { access_token: 'signup-tok' },
          },
        });
      }),
    });
    const result = await verifyOtp(port, 'new@b.com', '654321');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().userId).toBe('u2');
    expect(port.verifyOtp).toHaveBeenCalledTimes(2);
  });

  it('returns AUTH_OTP_INVALID when both attempts fail', async () => {
    const port = makePort({
      verifyOtp: vi.fn(() => Promise.resolve({ data: {}, error: { message: 'invalid otp' } })),
    });
    const result = await verifyOtp(port, 'a@b.com', 'bad');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('auth.otp_invalid');
  });

  it('returns AUTH_OTP_INVALID when success response lacks session/user', async () => {
    const port = makePort({
      verifyOtp: vi.fn(() => Promise.resolve({ data: {} })),
    });
    const result = await verifyOtp(port, 'a@b.com', '123456');
    expect(result.isErr()).toBe(true);
  });

  // CR-18 F-AU4: hint `'otp'` casava "OTP service unavailable" / "OTP rate
  // limit" e disparava fallback signup, mascarando erro real e queimando
  // rate-limit. Hint trocado por `'token'`.
  it('does NOT retry on non-token errors (rate limit, network unreachable)', async () => {
    const port = makePort({
      verifyOtp: vi.fn(() =>
        Promise.resolve({ data: {}, error: { message: 'OTP rate limit exceeded' } }),
      ),
    });
    const result = await verifyOtp(port, 'a@b.com', '123456');
    expect(result.isErr()).toBe(true);
    // Apenas UMA tentativa — rate limit não dispara fallback signup.
    expect(port.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on bare network error message', async () => {
    const port = makePort({
      verifyOtp: vi.fn(() =>
        Promise.resolve({ data: {}, error: { message: 'Network unreachable' } }),
      ),
    });
    const result = await verifyOtp(port, 'a@b.com', '123456');
    expect(result.isErr()).toBe(true);
    expect(port.verifyOtp).toHaveBeenCalledTimes(1);
  });
});
