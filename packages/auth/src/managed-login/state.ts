import type { AuthError } from '@g4os/kernel/errors';
import type { AuthSession } from '../types.ts';

/**
 * Estados do FSM do `ManagedLoginService`. Contém o e-mail do usuário em
 * plano para que o renderer consiga mostrá-lo na tela de OTP e fazer
 * "reenviar código" sem nova entrada.
 *
 * **PII contract (CR4-20):** o stream `state$` é destinado SOMENTE ao
 * renderer da janela de login ativa. **Não** persistir, **não** logar
 * (pino), **não** enviar para Sentry. Para telemetria use
 * `redactManagedLoginState(state)` que devolve uma versão sem email.
 */
export type ManagedLoginState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'requesting_otp'; readonly email: string }
  | { readonly kind: 'awaiting_otp'; readonly email: string }
  | { readonly kind: 'verifying'; readonly email: string }
  | { readonly kind: 'bootstrapping'; readonly session: AuthSession }
  | { readonly kind: 'authenticated'; readonly session: AuthSession }
  | { readonly kind: 'error'; readonly error: AuthError; readonly previous: ManagedLoginState };

export type ManagedLoginStateKind = ManagedLoginState['kind'];

export const IDLE_STATE: ManagedLoginState = { kind: 'idle' };

/**
 * Versão redigida do estado para telemetria. Substitui email pelo domínio
 * apenas (`*@dominio.com`). Usar quando precisar logar transição de FSM
 * em pino/Sentry sem violar PII contract.
 */
export type RedactedManagedLoginState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'requesting_otp'; readonly emailDomain: string }
  | { readonly kind: 'awaiting_otp'; readonly emailDomain: string }
  | { readonly kind: 'verifying'; readonly emailDomain: string }
  | { readonly kind: 'bootstrapping' }
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'error'; readonly errorCode: string };

export function redactManagedLoginState(state: ManagedLoginState): RedactedManagedLoginState {
  switch (state.kind) {
    case 'idle':
      return { kind: 'idle' };
    case 'requesting_otp':
    case 'awaiting_otp':
    case 'verifying': {
      const at = state.email.lastIndexOf('@');
      const emailDomain = at >= 0 ? state.email.slice(at + 1) : 'unknown';
      return { kind: state.kind, emailDomain };
    }
    case 'bootstrapping':
      return { kind: 'bootstrapping' };
    case 'authenticated':
      return { kind: 'authenticated' };
    case 'error':
      return { kind: 'error', errorCode: state.error.code };
    default: {
      const _exhaustive: never = state;
      void _exhaustive;
      return { kind: 'idle' };
    }
  }
}
