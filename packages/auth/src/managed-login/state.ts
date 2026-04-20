import type { AuthError } from '@g4os/kernel/errors';
import type { AuthSession } from '../types.ts';

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
