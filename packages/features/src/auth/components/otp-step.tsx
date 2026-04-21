import { Button, Input, Spinner, StepFormLayout, useTranslate } from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthErrorBanner } from './auth-error-banner.tsx';

interface OtpStepProps {
  readonly email: string;
  readonly isLoading: boolean;
  readonly error?: string;
  readonly onSubmit: (code: string) => void;
  readonly onBack: () => void;
}

export function OtpStep({ email, isLoading, error, onSubmit, onBack }: OtpStepProps) {
  const { t } = useTranslate();
  const schema = z.object({
    code: z.string().regex(/^\d{6}$/u, t('auth.otp.invalidFormat')),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v.code))} className="w-full">
      <StepFormLayout
        icon={ShieldCheck}
        title={t('auth.login.title')}
        description={t('auth.otp.sentTo', { email })}
        actions={
          <>
            <Button
              type="submit"
              disabled={isLoading}
              className="h-11 w-full rounded-lg bg-background text-foreground shadow-minimal hover:bg-foreground-5"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  {t('auth.otp.submitting')}
                </span>
              ) : (
                t('auth.otp.submit')
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={isLoading}
              className="h-9 text-xs text-muted-foreground hover:underline"
            >
              {t('auth.otp.useAnotherEmail')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="login-otp" className="text-center text-sm font-semibold text-foreground">
            {t('auth.otp.label')}
          </label>
          <Input
            id="login-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder={t('auth.otp.placeholder')}
            autoFocus={true}
            aria-invalid={errors.code ? true : undefined}
            className="text-center font-mono text-lg tracking-[0.5em]"
            {...register('code')}
          />
          {errors.code ? (
            <p className="text-center text-xs text-destructive" aria-live="polite">
              {errors.code.message}
            </p>
          ) : null}
        </div>

        {error ? <AuthErrorBanner message={error} /> : null}
      </StepFormLayout>
    </form>
  );
}
