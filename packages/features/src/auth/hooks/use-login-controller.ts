import { useTranslate } from '@g4os/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

export type LoginControllerState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'requesting_otp'; readonly email: string }
  | { readonly kind: 'awaiting_otp'; readonly email: string }
  | { readonly kind: 'verifying'; readonly email: string }
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'error'; readonly message: string; readonly email?: string };

/**
 * Status textual emitido durante operações longas. Diferente do `state`,
 * `status` é puramente descritivo (renderizado abaixo do form). V1 mostrava
 * `Enviando código...`, `Código enviado`, `Verificando...`, `Login bem-sucedido`
 * para feedback contínuo além do spinner do botão.
 */
export type LoginControllerStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent' }
  | { readonly kind: 'verifying' }
  | { readonly kind: 'success' };

export interface LoginControllerPorts {
  sendOtp(email: string): Promise<void>;
  verifyOtp(email: string, code: string): Promise<void>;
}

export interface LoginController {
  readonly state: LoginControllerState;
  readonly status: LoginControllerStatus;
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
  const [status, setStatus] = useState<LoginControllerStatus>({ kind: 'idle' });
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
      setStatus({ kind: 'sending' });
      try {
        await ports.sendOtp(email);
        setState({ kind: 'awaiting_otp', email });
        setStatus({ kind: 'sent' });
        startCooldown(COOLDOWN_SECONDS);
      } catch (err) {
        setStatus({ kind: 'idle' });
        setState({
          kind: 'error',
          message: errorMessage(err) ?? t('auth.error.sendOtpFallback'),
        });
      }
    },
    [ports, t, startCooldown],
  );

  const handleResendError = useCallback(
    (email: string, err: unknown) => {
      const msg = errorMessage(err) ?? '';
      const retryAfter = extractRetryAfterSeconds(msg);
      if (retryAfter !== null && retryAfter > 0) {
        startCooldown(Math.max(cooldownSeconds, retryAfter));
      }
      setStatus({ kind: 'idle' });
      setState({
        kind: 'error',
        email,
        message: msg || t('auth.error.sendOtpFallback'),
      });
    },
    [cooldownSeconds, startCooldown, t],
  );

  const resendOtp = useCallback(async () => {
    const email = 'email' in state ? state.email : undefined;
    if (!email || cooldownSeconds > 0 || isResending) return;
    setIsResending(true);
    setStatus({ kind: 'sending' });
    try {
      await ports.sendOtp(email);
      startCooldown(COOLDOWN_SECONDS);
      setStatus({ kind: 'sent' });
      if (state.kind === 'error') setState({ kind: 'awaiting_otp', email });
    } catch (err) {
      handleResendError(email, err);
    } finally {
      setIsResending(false);
    }
  }, [ports, state, cooldownSeconds, isResending, startCooldown, handleResendError]);

  const submitOtp = useCallback(
    async (code: string) => {
      const email = 'email' in state ? state.email : undefined;
      if (!email) {
        setStatus({ kind: 'idle' });
        setState({ kind: 'error', message: t('auth.error.resetRequired') });
        return;
      }
      setState({ kind: 'verifying', email });
      setStatus({ kind: 'verifying' });
      try {
        await ports.verifyOtp(email, code);
        setStatus({ kind: 'success' });
        setState({ kind: 'authenticated' });
      } catch (err) {
        setStatus({ kind: 'idle' });
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
    setStatus({ kind: 'idle' });
    setCooldownSeconds(0);
    if (cooldownTimer.current) {
      clearInterval(cooldownTimer.current);
      cooldownTimer.current = null;
    }
  }, []);

  return {
    state,
    status,
    cooldownSeconds,
    isResending,
    requestOtp,
    resendOtp,
    submitOtp,
    reset,
  };
}

function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return undefined;
}

/**
 * CR-37 F-CR37-6: generalizado para capturar cooldown do backend independentemente do locale.
 * Estratégias (em ordem):
 *  1. Campo numérico `retryAfter` no objeto de erro (adicionado pelo adapter de auth).
 *  2. Header HTTP `Retry-After` embutido na mensagem como "Retry-After: N".
 *  3. Padrão inglês Supabase "after N seconds".
 *  4. Padrão genérico qualquer número seguido de "s" ou "seg" ou "segs".
 */
function extractRetryAfterSeconds(msg: string): number | null {
  // Padrão inglês Supabase
  const enMatch = /after\s+(\d+)\s+seconds?/i.exec(msg);
  if (enMatch) return Number(enMatch[1]);
  // Header HTTP embutido na mensagem
  const headerMatch = /Retry-After:\s*(\d+)/i.exec(msg);
  if (headerMatch) return Number(headerMatch[1]);
  // Padrão genérico: qualquer "N segundo(s)" ou "N seg(s)"
  const genericMatch = /(\d+)\s*s(?:eg(?:und[oa]s?)?)?(?:\s|$)/i.exec(msg);
  if (genericMatch) return Number(genericMatch[1]);
  return null;
}
