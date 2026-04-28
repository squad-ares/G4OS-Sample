import {
  Button,
  Input,
  InputField,
  Label,
  OtpField,
  Spinner,
  StepFormLayout,
  useTranslate,
} from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Mail, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { type Control, type UseFormHandleSubmit, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { LoginController, LoginControllerStatus } from '../hooks/use-login-controller.ts';
import { AuthErrorBanner } from './auth-error-banner.tsx';

export type LoginCardMode = 'login' | 'reauth';

interface LoginCardProps {
  readonly controller: LoginController;
  readonly mode: LoginCardMode;
  readonly initialError?: string | undefined;
  readonly onReset?: (() => void) | undefined;
  readonly reauthEmail?: string | undefined;
}

interface EmailValues {
  email: string;
}

interface OtpValues {
  code: string;
}

export function LoginCard({
  controller,
  mode,
  initialError,
  onReset,
  reauthEmail,
}: LoginCardProps) {
  const { t } = useTranslate();
  const { state, status, cooldownSeconds, isResending, requestOtp, resendOtp, submitOtp, reset } =
    controller;

  const phase = derivePhase(state);
  const currentEmail = 'email' in state ? state.email : (reauthEmail ?? '');

  const emailSchema = useMemo(() => z.object({ email: z.email(t('auth.email.invalid')) }), [t]);
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    mode: 'onChange',
    defaultValues: { email: reauthEmail ?? '' },
  });

  const otpSchema = useMemo(
    () =>
      z.object({
        code: z.string().regex(/^\d{6}$/u, t('auth.otp.invalidFormat')),
      }),
    [t],
  );
  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
  });

  const handleEmailSubmit = (values: EmailValues) => {
    void requestOtp(values.email.trim().toLowerCase());
  };

  const handleOtpSubmit = (values: OtpValues) => {
    void submitOtp(values.code);
  };

  const handleChangeEmail = () => {
    if (phase.busy) return;
    otpForm.reset({ code: '' });
    reset();
  };

  const errors = computeErrors(state, initialError);

  return (
    <StepFormLayout
      iconElement={<HeaderIcon mode={mode} />}
      title={mode === 'reauth' ? t('auth.reauth.title') : t('auth.login.title')}
      description={<Description mode={mode} hasSentOtp={phase.hasSentOtp} email={currentEmail} />}
      actions={
        <ActionsArea
          phase={phase}
          isResending={isResending}
          cooldownSeconds={cooldownSeconds}
          emailValid={emailForm.formState.isValid}
          onSubmitEmail={emailForm.handleSubmit(handleEmailSubmit)}
          onSubmitOtp={otpForm.handleSubmit(handleOtpSubmit)}
          onResend={() => {
            void resendOtp();
          }}
          {...(onReset ? { onReset } : {})}
        />
      }
    >
      {phase.hasSentOtp ? (
        <ReadOnlyEmail
          email={currentEmail}
          disabled={phase.isVerifying || isResending}
          onChangeEmail={handleChangeEmail}
        />
      ) : (
        <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="flex flex-col gap-4">
          <InputField
            control={emailForm.control}
            name="email"
            autoComplete="email"
            label={t('auth.email.label')}
            placeholder={t('auth.email.placeholder')}
            disabled={phase.isSending}
            required={true}
          />
        </form>
      )}

      {phase.hasSentOtp ? (
        <OtpForm
          control={otpForm.control}
          handleSubmit={otpForm.handleSubmit}
          onSubmit={handleOtpSubmit}
          disabled={phase.isVerifying}
        />
      ) : null}

      <StatusLine status={status} />

      {errors.email ? <AuthErrorBanner message={errors.email} /> : null}
      {errors.otp ? <AuthErrorBanner message={errors.otp} /> : null}
    </StepFormLayout>
  );
}

interface PhaseInfo {
  readonly hasSentOtp: boolean;
  readonly isSending: boolean;
  readonly isVerifying: boolean;
  /** Combinação `isSending || isVerifying || isResending` para gates de UI. */
  readonly busy: boolean;
}

function derivePhase(state: LoginController['state']): PhaseInfo {
  const hasSentOtp =
    state.kind === 'awaiting_otp' ||
    state.kind === 'verifying' ||
    (state.kind === 'error' && state.email !== undefined);
  const isSending = state.kind === 'requesting_otp';
  const isVerifying = state.kind === 'verifying';
  return { hasSentOtp, isSending, isVerifying, busy: isSending || isVerifying };
}

function computeErrors(
  state: LoginController['state'],
  initialError: string | undefined,
): { readonly email?: string; readonly otp?: string } {
  if (state.kind === 'error') {
    return state.email === undefined ? { email: state.message } : { otp: state.message };
  }
  if (state.kind === 'idle' && initialError) {
    return { email: initialError };
  }
  return {};
}

function HeaderIcon({ mode }: { readonly mode: LoginCardMode }) {
  if (mode === 'reauth') {
    return (
      <div className="inline-flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="inline-flex size-16 items-center justify-center rounded-full bg-info/10">
      <ShieldCheck className="size-8 text-info" aria-hidden="true" />
    </div>
  );
}

function Description({
  mode,
  hasSentOtp,
  email,
}: {
  readonly mode: LoginCardMode;
  readonly hasSentOtp: boolean;
  readonly email: string;
}) {
  const { t } = useTranslate();
  if (mode === 'reauth') {
    return (
      <>
        {t('auth.reauth.description')}
        <br />
        <span className="mt-2 block text-xs text-muted-foreground/70">
          {t('auth.reauth.preserved')}
        </span>
      </>
    );
  }
  return <>{hasSentOtp ? t('auth.otp.sentTo', { email }) : t('auth.login.subtitle.email')}</>;
}

interface ActionsAreaProps {
  readonly phase: PhaseInfo;
  readonly isResending: boolean;
  readonly cooldownSeconds: number;
  readonly emailValid: boolean;
  readonly onSubmitEmail: () => void;
  readonly onSubmitOtp: () => void;
  readonly onResend: () => void;
  readonly onReset?: () => void;
}

function ActionsArea({
  phase,
  isResending,
  cooldownSeconds,
  emailValid,
  onSubmitEmail,
  onSubmitOtp,
  onResend,
  onReset,
}: ActionsAreaProps) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      {phase.hasSentOtp ? (
        <OtpActionButtons
          phase={phase}
          isResending={isResending}
          cooldownSeconds={cooldownSeconds}
          onSubmitOtp={onSubmitOtp}
          onResend={onResend}
        />
      ) : (
        <SendCodeButton
          isSending={phase.isSending}
          disabled={phase.isSending || !emailValid}
          onClick={onSubmitEmail}
        />
      )}
      {onReset ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          disabled={phase.busy || isResending}
          className="mt-6 h-auto px-0 py-0 text-xs text-muted-foreground/80 hover:text-foreground"
        >
          <ResetLabel />
        </Button>
      ) : null}
    </div>
  );
}

function ResetLabel() {
  const { t } = useTranslate();
  return <>{t('auth.reset.openButton')}</>;
}

function SendCodeButton({
  isSending,
  disabled,
  onClick,
}: {
  readonly isSending: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const { t } = useTranslate();
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 w-full rounded-lg bg-background text-foreground shadow-minimal hover:bg-foreground-5"
    >
      {isSending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner size="sm" />
          {t('auth.email.submitting')}
        </span>
      ) : (
        <span className="inline-flex items-center gap-2">
          <Mail className="size-4" />
          {t('auth.email.submit')}
        </span>
      )}
    </Button>
  );
}

function OtpActionButtons({
  phase,
  isResending,
  cooldownSeconds,
  onSubmitOtp,
  onResend,
}: {
  readonly phase: PhaseInfo;
  readonly isResending: boolean;
  readonly cooldownSeconds: number;
  readonly onSubmitOtp: () => void;
  readonly onResend: () => void;
}) {
  const { t } = useTranslate();
  const resendLabel =
    cooldownSeconds > 0
      ? t('auth.otp.resendWithSeconds', { seconds: cooldownSeconds })
      : t('auth.otp.resend');
  return (
    <>
      <Button
        type="button"
        onClick={onSubmitOtp}
        disabled={phase.isVerifying || phase.isSending}
        className="h-11 w-full rounded-lg bg-background text-foreground shadow-minimal hover:bg-foreground-5"
      >
        {phase.isVerifying ? (
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
        disabled={phase.isVerifying || isResending || cooldownSeconds > 0}
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
    </>
  );
}

function ReadOnlyEmail({
  email,
  disabled,
  onChangeEmail,
}: {
  readonly email: string;
  readonly disabled: boolean;
  readonly onChangeEmail: () => void;
}) {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="login-email-readonly" className="text-sm text-muted-foreground">
        {t('auth.email.label')}
      </Label>
      <Input
        id="login-email-readonly"
        value={email}
        readOnly={true}
        tabIndex={-1}
        className="bg-foreground/5 text-muted-foreground"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={onChangeEmail}
          disabled={disabled}
          className="h-auto px-0 py-0 text-xs text-muted-foreground hover:text-foreground"
        >
          {t('auth.otp.changeEmail')}
        </Button>
      </div>
    </div>
  );
}

function OtpForm({
  control,
  handleSubmit,
  onSubmit,
  disabled,
}: {
  readonly control: Control<OtpValues>;
  readonly handleSubmit: UseFormHandleSubmit<OtpValues>;
  readonly onSubmit: (values: OtpValues) => void;
  readonly disabled: boolean;
}) {
  const { t } = useTranslate();
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <OtpField
        control={control}
        name="code"
        label={t('auth.otp.label')}
        centerLabel={true}
        autoFocus={true}
        disabled={disabled}
      />
      <p className="text-center text-xs text-muted-foreground">{t('auth.otp.spamHint')}</p>
    </form>
  );
}

function StatusLine({ status }: { readonly status: LoginControllerStatus }) {
  const { t } = useTranslate();
  if (status.kind === 'idle') return null;
  const text =
    status.kind === 'sending'
      ? t('auth.status.sending')
      : status.kind === 'sent'
        ? t('auth.status.sent')
        : status.kind === 'verifying'
          ? t('auth.status.verifying')
          : t('auth.status.success');
  return (
    <p aria-live="polite" className="text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}
