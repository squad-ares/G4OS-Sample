import { Button, OtpField, Spinner, StepFormLayout, useTranslate } from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthErrorBanner } from './auth-error-banner.tsx';

interface OtpStepProps {
  readonly email: string;
  readonly isLoading: boolean;
  readonly cooldownSeconds: number;
  readonly isResending: boolean;
  readonly error?: string;
  readonly onSubmit: (code: string) => void;
  readonly onResend: () => void;
  readonly onBack: () => void;
}

export function OtpStep({
  email,
  isLoading,
  cooldownSeconds,
  isResending,
  error,
  onSubmit,
  onResend,
  onBack,
}: OtpStepProps) {
  const { t } = useTranslate();
  const schema = z.object({
    code: z.string().regex(/^\d{6}$/u, t('auth.otp.invalidFormat')),
  });
  type FormValues = z.infer<typeof schema>;
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  const resendLabel =
    cooldownSeconds > 0
      ? t('auth.otp.resendWithSeconds', { seconds: cooldownSeconds })
      : t('auth.otp.resend');

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
              onClick={onResend}
              disabled={isLoading || isResending || cooldownSeconds > 0}
              className="h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              {isResending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  {t('auth.otp.resending')}
                </span>
              ) : (
                resendLabel
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={isLoading || isResending}
              className="h-9 text-xs text-muted-foreground hover:underline"
            >
              {t('auth.otp.changeEmail')}
            </Button>
          </>
        }
      >
        <OtpField
          control={control}
          name="code"
          label={t('auth.otp.label')}
          centerLabel={true}
          autoFocus={true}
          disabled={isLoading}
        />
        <p className="text-center text-xs text-muted-foreground">{t('auth.otp.spamHint')}</p>

        {error ? <AuthErrorBanner message={error} /> : null}
      </StepFormLayout>
    </form>
  );
}
