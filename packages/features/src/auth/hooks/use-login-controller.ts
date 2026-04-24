import { useTranslate } from '@g4os/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  readonly cooldownSeconds: number;
  readonly isResending: boolean;
  requestOtp(email: string): Promise<void>;
  resendOtp(): Promise<void>;
  submitOtp(code: string): Promise<void>;
  reset(): void;
}

const COOLDOWN_SECONDS = 60;

export function useLoginController(ports: LoginControllerPorts): LoginController {
  const { t } = useTranslate();
  const [state, setState] = useState<LoginControllerState>({ kind: 'idle' });
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    },
    [],
  );

  const startCooldown = useCallback((seconds: number) => {
    setCooldownSeconds(seconds);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldownSeconds((current) => {
        if (current <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, []);

  const requestOtp = useCallback(
    async (email: string) => {
      setState({ kind: 'requesting_otp', email });
      try {
        await ports.sendOtp(email);
        setState({ kind: 'awaiting_otp', email });
        startCooldown(COOLDOWN_SECONDS);
      } catch (err) {
        setState({
          kind: 'error',
          message: errorMessage(err) ?? t('auth.error.sendOtpFallback'),
        });
      }
    },
    [ports, t, startCooldown],
  );

  const resendOtp = useCallback(async () => {
    const email = 'email' in state ? state.email : undefined;
    if (!email || cooldownSeconds > 0 || isResending) return;
    setIsResending(true);
    try {
      await ports.sendOtp(email);
      startCooldown(COOLDOWN_SECONDS);
      if (state.kind === 'error') setState({ kind: 'awaiting_otp', email });
    } catch (err) {
      setState({
        kind: 'error',
        email,
        message: errorMessage(err) ?? t('auth.error.sendOtpFallback'),
      });
    } finally {
      setIsResending(false);
    }
  }, [ports, state, cooldownSeconds, isResending, startCooldown, t]);

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

  const reset = useCallback(() => {
    setState({ kind: 'idle' });
    setCooldownSeconds(0);
    if (cooldownTimer.current) {
      clearInterval(cooldownTimer.current);
      cooldownTimer.current = null;
    }
  }, []);

  return { state, cooldownSeconds, isResending, requestOtp, resendOtp, submitOtp, reset };
}

function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return undefined;
}
