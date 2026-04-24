import { Button, InputField, Spinner, StepFormLayout, useTranslate } from '@g4os/ui';
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
  type FormValues = z.infer<typeof schema>;
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });

  const hasErrors = Object.keys(formState.errors).length > 0;

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v.email.trim().toLowerCase()))} className="w-full">
      <StepFormLayout
        icon={ShieldCheck}
        title={t('auth.login.title')}
        description={t('auth.login.subtitle.email')}
        actions={
          <Button
            type="submit"
            disabled={isLoading || hasErrors}
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
        <InputField
          control={control}
          name="email"
          // type="email"
          label={t('auth.email.label')}
          placeholder={t('auth.email.placeholder')}
          disabled={isLoading}
          required={true}
        />

        {error ? <AuthErrorBanner message={error} /> : null}
      </StepFormLayout>
    </form>
  );
}
