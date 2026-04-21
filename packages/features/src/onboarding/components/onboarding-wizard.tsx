import { Button, Input, useTranslate } from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

type Step = 'workspace-name' | 'agent-selection' | 'ready';

export interface OnboardingPorts {
  createWorkspace(input: { name: string }): Promise<{ id: string }>;
  createFirstSession(input: { workspaceId: string }): Promise<{ id: string }>;
}

export interface OnboardingWizardProps {
  readonly ports: OnboardingPorts;
  readonly onComplete: (result: { workspaceId: string; sessionId: string }) => void;
}

export function OnboardingWizard({ ports, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>('workspace-name');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl rounded-[32px] border border-foreground/10 bg-background/78 p-6 shadow-[0_24px_80px_rgba(0,31,53,0.10)] backdrop-blur-xl sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <OnboardingIntro />

          <div className="space-y-8">
            <StepProgress current={step} />

            {step === 'workspace-name' ? (
              <WorkspaceNameStep
                onNext={async (name) => {
                  setBusy(true);
                  try {
                    const ws = await ports.createWorkspace({ name });
                    setWorkspaceId(ws.id);
                    setStep('agent-selection');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : null}

            {step === 'agent-selection' && workspaceId ? (
              <AgentSelectionStep onNext={() => setStep('ready')} onSkip={() => setStep('ready')} />
            ) : null}

            {step === 'ready' && workspaceId ? (
              <ReadyStep
                isBusy={isBusy}
                onStart={async () => {
                  setBusy(true);
                  try {
                    const session = await ports.createFirstSession({ workspaceId });
                    onComplete({ workspaceId, sessionId: session.id });
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepProgress({ current }: { readonly current: Step }) {
  const { t } = useTranslate();
  const steps: readonly Step[] = ['workspace-name', 'agent-selection', 'ready'];
  const currentIndex = steps.indexOf(current);

  return (
    <ol className="flex items-center gap-2" aria-label={t('onboarding.progress.ariaLabel')}>
      {steps.map((stepName, index) => (
        <li
          key={stepName}
          aria-current={index === currentIndex ? 'step' : undefined}
          className={`h-2 w-12 rounded-full transition-colors ${
            index <= currentIndex ? 'bg-accent' : 'bg-foreground/10'
          }`}
        />
      ))}
    </ol>
  );
}

function WorkspaceNameStep({ onNext }: { readonly onNext: (name: string) => Promise<void> }) {
  const { t } = useTranslate();
  const schema = z.object({
    name: z.string().trim().min(1, t('onboarding.workspace.errorRequired')).max(50),
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <div className="flex w-full flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-[-0.03em]">
        {t('onboarding.workspace.title')}
      </h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {t('onboarding.workspace.description')}
      </p>

      <form
        onSubmit={handleSubmit((values) => onNext(values.name))}
        className="flex flex-col gap-3"
      >
        <Input
          placeholder={t('onboarding.workspace.placeholder')}
          autoFocus={true}
          {...register('name')}
        />
        {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('onboarding.workspace.creating') : t('onboarding.workspace.next')}
        </Button>
      </form>
    </div>
  );
}

function AgentSelectionStep({
  onNext,
  onSkip,
}: {
  readonly onNext: () => void;
  readonly onSkip: () => void;
}) {
  const { t } = useTranslate();

  return (
    <div className="flex w-full flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-[-0.03em]">{t('onboarding.agent.title')}</h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {t('onboarding.agent.description')}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <AgentCard
          name="Claude"
          description={t('onboarding.agent.claude.provider')}
          onClick={onNext}
        />
        <AgentCard
          name="Codex"
          description={t('onboarding.agent.codex.provider')}
          onClick={onNext}
        />
      </div>

      <Button variant="ghost" onClick={onSkip}>
        {t('onboarding.agent.skip')}
      </Button>
    </div>
  );
}

function AgentCard({
  name,
  description,
  onClick,
}: {
  readonly name: string;
  readonly description: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-[22px] border border-foreground/10 bg-background/84 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/5"
    >
      <span className="text-sm font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function ReadyStep({
  isBusy,
  onStart,
}: {
  readonly isBusy: boolean;
  readonly onStart: () => void;
}) {
  const { t } = useTranslate();

  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-accent text-2xl text-background shadow-[0_16px_30px_rgba(185,145,91,0.32)]">
        ✓
      </div>
      <h2 className="text-3xl font-semibold tracking-[-0.03em]">{t('onboarding.ready.title')}</h2>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">
        {t('onboarding.ready.description')}
      </p>
      <Button size="lg" onClick={onStart} disabled={isBusy}>
        {isBusy ? t('onboarding.ready.starting') : t('onboarding.ready.start')}
      </Button>
    </div>
  );
}

function OnboardingIntro() {
  const { t } = useTranslate();

  return (
    <div className="hidden h-full rounded-[28px] border border-foreground/10 bg-[linear-gradient(150deg,rgba(255,255,255,0.72),rgba(255,255,255,0.34))] p-6 lg:flex lg:flex-col lg:justify-between">
      <div className="space-y-4">
        <div className="inline-flex size-12 items-center justify-center rounded-[18px] bg-foreground text-base font-semibold text-background">
          {t('app.mark')}
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
            {t('onboarding.intro.title')}
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">
            {t('onboarding.intro.description')}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <IntroCard
          label={t('onboarding.intro.card.v1.label')}
          text={t('onboarding.intro.card.v1.text')}
        />
        <IntroCard
          label={t('onboarding.intro.card.i18n.label')}
          text={t('onboarding.intro.card.i18n.text')}
        />
        <IntroCard
          label={t('onboarding.intro.card.auth.label')}
          text={t('onboarding.intro.card.auth.text')}
        />
      </div>
    </div>
  );
}

interface IntroCardProps {
  readonly label: string;
  readonly text: string;
}

function IntroCard({ label, text }: IntroCardProps) {
  return (
    <div className="rounded-[20px] border border-foreground/10 bg-background/70 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
