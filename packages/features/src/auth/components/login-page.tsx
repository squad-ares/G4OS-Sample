import { LanguageSwitcher } from '@g4os/ui';
import type { LoginController } from '../hooks/use-login-controller.ts';
import { EmailStep } from './email-step.tsx';
import { OtpStep } from './otp-step.tsx';

export interface LoginPageProps {
  readonly controller: LoginController;
}

export function LoginPage({ controller }: LoginPageProps) {
  const { state, cooldownSeconds, isResending, requestOtp, resendOtp, submitOtp, reset } =
    controller;

  const isAwaitingOtp = state.kind === 'awaiting_otp' || state.kind === 'verifying';
  const otpError = state.kind === 'error' && state.email ? state.message : undefined;
  const emailError =
    state.kind === 'error' && state.email === undefined ? state.message : undefined;

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-foreground-2 text-foreground">
      <div className="titlebar-drag-region fixed inset-x-0 top-0 z-10 h-12.5" />

      <div className="fixed right-4 top-4 z-20 titlebar-no-drag">
        <LanguageSwitcher size="sm" variant="ghost" />
      </div>

      <main className="flex flex-1 items-center justify-center p-8">
        <div className="w-md max-w-full">
          {isAwaitingOtp && 'email' in state ? (
            <OtpStep
              email={state.email}
              isLoading={state.kind === 'verifying'}
              cooldownSeconds={cooldownSeconds}
              isResending={isResending}
              {...(otpError ? { error: otpError } : {})}
              onSubmit={(code) => {
                void submitOtp(code);
              }}
              onResend={() => {
                void resendOtp();
              }}
              onBack={reset}
            />
          ) : (
            <EmailStep
              isLoading={state.kind === 'requesting_otp'}
              {...(emailError ? { error: emailError } : {})}
              onSubmit={(email) => {
                void requestOtp(email);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
