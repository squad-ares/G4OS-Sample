import { Button, Input, Spinner, StepFormLayout, useTranslate } from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthErrorBanner } from './auth-error-banner.tsx';

interface EmailStepProps {
  readonly isLoading: boolean;
  readonly error?: string;
  readonly onSubmit: (email: string) => void;
}

export function EmailStep({ isLoading, error, onSubmit }: EmailStepProps) {
  const { t } = useTranslate();
  const schema = z.object({ email: z.email(t('auth.email.invalid')) });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v.email))} className="w-full">
      <StepFormLayout
        icon={ShieldCheck}
        title={t('auth.login.title')}
        description={t('auth.login.subtitle.email')}
        actions={
          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full rounded-lg bg-background text-foreground shadow-minimal hover:bg-foreground-5"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" />
                {t('auth.email.submitting')}
              </span>
            ) : (
              t('auth.email.submit')
            )}
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="login-email" className="text-sm font-medium text-foreground">
            {t('auth.email.label')}
          </label>
          <Input
            id="login-email"
            type="email"
            placeholder={t('auth.email.placeholder')}
            autoComplete="email"
            autoFocus={true}
            aria-invalid={errors.email ? true : undefined}
            {...register('email')}
          />
          {errors.email ? (
            <p className="text-xs text-destructive" aria-live="polite">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        {error ? <AuthErrorBanner message={error} /> : null}
      </StepFormLayout>
    </form>
  );
}
