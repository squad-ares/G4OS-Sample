import type { Workspace } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { useState } from 'react';
import {
  DEFAULT_SOURCE_SEEDS,
  WORKSPACE_COLORS,
  WORKSPACE_WIZARD_STEPS,
  type WorkspaceWizardStep,
} from '../types.ts';
import { DefaultsStep } from './wizard/defaults-step.tsx';
import { FinishStep } from './wizard/finish-step.tsx';
import { NameStep } from './wizard/name-step.tsx';
import type { WorkspaceSetupWizardDraft } from './wizard/shared.tsx';
import { SourcesStep } from './wizard/sources-step.tsx';
import { StyleStep } from './wizard/style-step.tsx';
import { WorkingDirStep } from './wizard/working-dir-step.tsx';

export type { WorkspaceSetupWizardDraft };

export interface WorkspaceSetupWizardProps {
  readonly initialName?: string;
  readonly submitting?: boolean;
  readonly onCancel?: () => void;
  readonly onSubmit: (
    draft: WorkspaceSetupWizardDraft,
  ) => Promise<{ readonly workspaceId: Workspace['id'] }>;
  readonly onComplete: (result: { workspaceId: Workspace['id'] }) => void;
}

export function WorkspaceSetupWizard({
  initialName,
  submitting = false,
  onCancel,
  onSubmit,
  onComplete,
}: WorkspaceSetupWizardProps) {
  const { t } = useTranslate();
  const [step, setStep] = useState<WorkspaceWizardStep>('name');
  const [draft, setDraft] = useState<WorkspaceSetupWizardDraft>({
    name: initialName ?? '',
    color: WORKSPACE_COLORS[0]?.id ?? 'indigo',
    workingDirectory: '',
    defaults: { permissionPreset: 'balanced', thinkingLevel: 'medium' },
    enabledSources: DEFAULT_SOURCE_SEEDS.map((s) => s.slug),
    styleInterview: { language: 'pt-BR', tone: 'neutral', skip: false },
  });

  const currentIndex = WORKSPACE_WIZARD_STEPS.indexOf(step);
  const isLast = step === 'finish';

  const go = (next: WorkspaceWizardStep) => setStep(next);

  const handleSubmit = async () => {
    const result = await onSubmit(draft);
    onComplete(result);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-foreground/10 bg-background/80 p-6 shadow-[0_24px_80px_rgba(0,31,53,0.08)] backdrop-blur-xl sm:p-8">
      <header className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          {t('workspace.wizard.eyebrow')}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('workspace.wizard.title')}</h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          {t('workspace.wizard.description')}
        </p>
        <StepProgress currentIndex={currentIndex} />
      </header>

      <div className="min-h-[260px]">
        {step === 'name' ? (
          <NameStep draft={draft} onChange={setDraft} onNext={() => go('working-dir')} />
        ) : null}
        {step === 'working-dir' ? (
          <WorkingDirStep
            draft={draft}
            onChange={setDraft}
            onBack={() => go('name')}
            onNext={() => go('defaults')}
          />
        ) : null}
        {step === 'defaults' ? (
          <DefaultsStep
            draft={draft}
            onChange={setDraft}
            onBack={() => go('working-dir')}
            onNext={() => go('sources')}
          />
        ) : null}
        {step === 'sources' ? (
          <SourcesStep
            draft={draft}
            onChange={setDraft}
            onBack={() => go('defaults')}
            onNext={() => go('style')}
          />
        ) : null}
        {step === 'style' ? (
          <StyleStep
            draft={draft}
            onChange={setDraft}
            onBack={() => go('sources')}
            onNext={() => go('finish')}
          />
        ) : null}
        {step === 'finish' ? (
          <FinishStep
            draft={draft}
            submitting={submitting}
            onBack={() => go('style')}
            onSubmit={handleSubmit}
          />
        ) : null}
      </div>

      {onCancel && !isLast ? (
        <div className="border-t border-foreground/6 pt-4 text-right">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('workspace.wizard.cancel')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StepProgress({ currentIndex }: { readonly currentIndex: number }) {
  const { t } = useTranslate();
  return (
    <ol aria-label={t('workspace.wizard.progress.ariaLabel')} className="flex items-center gap-2">
      {WORKSPACE_WIZARD_STEPS.map((stepName, index) => (
        <li
          key={stepName}
          aria-current={index === currentIndex ? 'step' : undefined}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            index <= currentIndex ? 'bg-accent' : 'bg-foreground/10'
          }`}
        />
      ))}
    </ol>
  );
}
