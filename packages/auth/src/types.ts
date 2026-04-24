import type { AuthError } from '@g4os/kernel/errors';
import type { Result } from 'neverthrow';

/**
 * Auth session persisted locally after a successful OTP verification.
 * expiresAt is a unix epoch millis timestamp.
 */
export interface AuthSession {
  readonly userId: string;
  readonly email: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
}

/**
 * Minimal port over the Supabase auth client used by OTP flows.
 * The desktop app wires this to `@supabase/supabase-js` at composition root;
 * this package never imports the SDK directly so it stays testable and
 * boundary-clean.
 */
export interface SupabaseAuthPort {
  signInWithOtp(input: { email: string; shouldCreateUser?: boolean }): Promise<SupabaseOtpResult>;
  verifyOtp(input: {
    email: string;
    token: string;
    type: 'email' | 'signup' | 'magiclink';
  }): Promise<SupabaseVerifyResult>;
  refreshSession(input: { refreshToken: string }): Promise<SupabaseRefreshResult>;
}

export interface SupabaseOtpResult {
  readonly error?: { message: string; status?: number };
}

export interface SupabaseVerifyResult {
  readonly data: {
    readonly user?: { id: string; email?: string };
    readonly session?: {
      readonly access_token: string;
      readonly refresh_token?: string;
      readonly expires_at?: number;
    };
  };
  readonly error?: { message: string; status?: number };
}

export interface SupabaseRefreshResult {
  readonly data: {
    readonly session?: {
      readonly access_token: string;
      readonly refresh_token?: string;
      readonly expires_at?: number;
    };
  };
  readonly error?: { message: string; status?: number };
}

/**
 * Storage port used to persist session tokens. Mirrors the
 * `CredentialVault` surface without importing @g4os/credentials
 * (keeps this package boundary-clean).
 */
export interface AuthTokenStore {
  get(key: string): Promise<Result<string, AuthError>>;
  set(key: string, value: string, meta?: { expiresAt?: number }): Promise<Result<void, AuthError>>;
  delete(key: string): Promise<Result<void, AuthError>>;
  list(): Promise<Result<ReadonlyArray<{ key: string; expiresAt?: number }>, AuthError>>;
}

export const AUTH_ACCESS_TOKEN_KEY = 'auth.access-token';
export const AUTH_REFRESH_TOKEN_KEY = 'auth.refresh-token';
export const AUTH_SESSION_META_KEY = 'auth.session-meta';
