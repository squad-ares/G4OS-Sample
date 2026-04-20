import { AuthError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { AuthSession, SupabaseAuthPort } from '../types.ts';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function sendOtp(
  port: SupabaseAuthPort,
  email: string,
): Promise<Result<void, AuthError>> {
  const normalized = normalizeEmail(email);
  const { error } = await port.signInWithOtp({ email: normalized, shouldCreateUser: true });
  if (error) {
    return err(
      new AuthError({
        code: ErrorCode.AUTH_NOT_AUTHENTICATED,
        message: error.message,
        context: { supabaseStatus: error.status, phase: 'send_otp' },
      }),
    );
  }
  return ok(undefined);
}

const INVALID_TOKEN_HINTS = ['invalid', 'expired', 'not found', 'otp'];

function looksLikeInvalidOtp(message: string): boolean {
  const lower = message.toLowerCase();
  return INVALID_TOKEN_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Verify an OTP. Supabase 2024+ returns `type: 'email'` for existing users
 * and `type: 'signup'` when the user is being created on first verify. V1
 * hard-coded `email` and silently failed; we try `email` first, then
 * fall back to `signup` if the error message hints at an invalid type.
 */
export async function verifyOtp(
  port: SupabaseAuthPort,
  email: string,
  token: string,
): Promise<Result<AuthSession, AuthError>> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = token.trim();

  let result = await port.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: 'email',
  });

  if (result.error && looksLikeInvalidOtp(result.error.message)) {
    result = await port.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: 'signup',
    });
  }

  if (result.error || !result.data.session || !result.data.user?.id) {
    return err(
      new AuthError({
        code: ErrorCode.AUTH_OTP_INVALID,
        message: result.error?.message ?? 'OTP verification failed',
        context: { supabaseStatus: result.error?.status, phase: 'verify_otp' },
      }),
    );
  }

  const user = result.data.user;
  const session = result.data.session;

  return ok({
    userId: user.id,
    email: user.email ?? normalizedEmail,
    accessToken: session.access_token,
    ...(session.refresh_token ? { refreshToken: session.refresh_token } : {}),
    ...(typeof session.expires_at === 'number' ? { expiresAt: session.expires_at * 1000 } : {}),
  });
}
