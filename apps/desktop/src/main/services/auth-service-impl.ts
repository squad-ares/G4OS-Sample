/**
 * Implementações de `AuthService` (IPC) sobre o `ManagedLoginService` real
 * e sobre o estado "Supabase env ausente" — extraído de `auth-runtime.ts`
 * para manter cada arquivo dentro do limite de 300 LOC.
 */

import type { ManagedLoginService } from '@g4os/auth';
import type { AuthService, IpcSession } from '@g4os/ipc/server';
import { AppError, AuthError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';
import type { ManagedLoginRequiredHub } from './managed-login-required-hub.ts';

const log = createLogger('auth-service-impl');

export type WipeFn = () => Promise<Result<void, AppError>>;

export function createAuthServiceFromManagedLogin(
  managed: ManagedLoginService,
  onPostVerify: () => Promise<void>,
  reauthHub: ManagedLoginRequiredHub,
  performWipe: WipeFn | undefined,
): AuthService {
  const toIpcSession = (): IpcSession | null => {
    const state = managed.state;
    if (state.kind === 'authenticated' || state.kind === 'bootstrapping') {
      const s = state.session;
      return {
        userId: s.userId,
        email: s.email,
        ...(s.expiresAt === undefined ? {} : { expiresAt: s.expiresAt }),
      };
    }
    return null;
  };

  return {
    getMe: (): Promise<Result<IpcSession, AppError>> => {
      const session = toIpcSession();
      if (!session) return Promise.resolve(err(AuthError.notAuthenticated()));
      return Promise.resolve(ok(session));
    },

    sendOtp: async (email: string): Promise<Result<void, AppError>> => {
      const result = await managed.requestOtp(email);
      if (result.isErr()) return err(result.error);
      return ok(undefined);
    },

    verifyOtp: async (email: string, code: string): Promise<Result<IpcSession, AppError>> => {
      const result = await managed.submitOtp(email, code);
      if (result.isErr()) return err(result.error);
      await onPostVerify();
      const session = toIpcSession();
      if (!session) {
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'Estado inconsistente após verify_otp',
          }),
        );
      }
      return ok(session);
    },

    signOut: async (): Promise<Result<void, AppError>> => {
      await managed.logout();
      return ok(undefined);
    },

    wipeAndReset: async (): Promise<Result<void, AppError>> => {
      if (!performWipe) return err(wipeDisabledError());
      // Garantir que a sessão é encerrada antes de apagar dados — falha em
      // logout não bloqueia o reset (vault e workspaces serão apagados logo
      // a seguir, então a sessão fica inválida de qualquer forma).
      try {
        await managed.logout();
      } catch (e) {
        log.warn({ err: e }, 'logout failed during wipeAndReset; continuing');
      }
      return performWipe();
    },

    subscribeManagedLoginRequired: (handler) => reauthHub.subscribe(handler),
  };
}

export function createUnavailableAuthService(
  missingEnv: readonly string[],
  reauthHub: ManagedLoginRequiredHub,
  performWipe: WipeFn | undefined,
): AuthService {
  const buildError = (): AppError =>
    new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Login OTP indisponível. Configure ${missingEnv.join(', ')} em .env na raiz do monorepo (veja .env.example).`,
      context: { missingEnv },
    });

  return {
    getMe: async () => err(AuthError.notAuthenticated()),
    sendOtp: async () => err(buildError()),
    verifyOtp: async () => err(buildError()),
    signOut: async () => ok(undefined),
    wipeAndReset: () => {
      if (!performWipe) return Promise.resolve(err(wipeDisabledError()));
      return performWipe();
    },
    subscribeManagedLoginRequired: (handler) => reauthHub.subscribe(handler),
  };
}

function wipeDisabledError(): AppError {
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: 'Reset destrutivo não está habilitado neste runtime.',
  });
}
