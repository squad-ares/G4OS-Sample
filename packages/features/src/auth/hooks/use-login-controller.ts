import { useTranslate } from '@g4os/ui';
import { useCallback, useState } from 'react';

export type LoginControllerState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'requesting_otp'; readonly email: string }
  | { readonly kind: 'awaiting_otp'; readonly email: string }
  | { readonly kind: 'verifying'; readonly email: string }
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'error'; readonly message: string; readonly email?: string };

export interface LoginControllerPorts {
  sendOtp(email: string): Promise<void>;
  verifyOtp(email: string, code: string): Promise<void>;
}

export interface LoginController {
  readonly state: LoginControllerState;
  requestOtp(email: string): Promise<void>;
  submitOtp(code: string): Promise<void>;
  reset(): void;
}

export function useLoginController(ports: LoginControllerPorts): LoginController {
  const { t } = useTranslate();
  const [state, setState] = useState<LoginControllerState>({ kind: 'idle' });

  const requestOtp = useCallback(
    async (email: string) => {
      setState({ kind: 'requesting_otp', email });
      try {
        await ports.sendOtp(email);
        setState({ kind: 'awaiting_otp', email });
      } catch (err) {
        setState({
          kind: 'error',
          message: errorMessage(err) ?? t('auth.error.sendOtpFallback'),
        });
      }
    },
    [ports, t],
  );

  const submitOtp = useCallback(
    async (code: string) => {
      const email = 'email' in state ? state.email : undefined;
      if (!email) {
        setState({ kind: 'error', message: t('auth.error.resetRequired') });
        return;
      }
      setState({ kind: 'verifying', email });
      try {
        await ports.verifyOtp(email, code);
        setState({ kind: 'authenticated' });
      } catch (err) {
        setState({
          kind: 'error',
          email,
          message: errorMessage(err) ?? t('auth.error.verifyFallback'),
        });
      }
    },
    [ports, state, t],
  );

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, requestOtp, submitOtp, reset };
}

function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return undefined;
}
