import { AuthError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { AuthSession, SupabaseAuthPort } from '../types.ts';

// Validação leve de email antes de enviar para Supabase. Sem isso,
// emails malformados (vazio, sem @, espaço duplo) viram round-trip pra
// Supabase só pra retornar erro com message vaga. Validar local economiza
// rede + dá feedback mais claro ao caller. Padrão RFC-5322 simplificado.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(normalized: string): Result<void, AuthError> {
  if (normalized.length === 0 || normalized.length > 320 || !EMAIL_RE.test(normalized)) {
    return err(
      new AuthError({
        code: ErrorCode.AUTH_NOT_AUTHENTICATED,
        message: 'invalid email format',
        context: { phase: 'validate_email' },
      }),
    );
  }
  return ok(undefined);
}

export async function sendOtp(
  port: SupabaseAuthPort,
  email: string,
): Promise<Result<void, AuthError>> {
  const normalized = normalizeEmail(email);
  const validation = validateEmail(normalized);
  if (validation.isErr()) return err(validation.error);
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

// CR-18 F-AU4: hint `'otp'` casava qualquer mensagem do Supabase contendo
// a palavra OTP, inclusive "OTP service unavailable" ou "OTP rate limit
// exceeded" — disparava segunda tentativa com `type:'signup'`, mascarando
// erro real e queimando rate-limit. ADR-0091 sugere `/invalid|expired|token/i`;
// mantemos a especificidade no nível dos hints para maior controle.
const INVALID_TOKEN_HINTS = ['invalid', 'expired', 'not found', 'token'];

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
