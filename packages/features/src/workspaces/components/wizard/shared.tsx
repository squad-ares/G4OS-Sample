import { Button, useTranslate } from '@g4os/ui';
import type { Dispatch, SetStateAction } from 'react';
import type { PermissionPreset, ThinkingLevel } from '../../types.ts';

export interface WorkspaceSetupWizardDraft {
  readonly name: string;
  readonly color: string;
  readonly workingDirectory: string;
  readonly defaults: {
    readonly permissionPreset: PermissionPreset;
    readonly thinkingLevel: ThinkingLevel;
  };
  readonly enabledSources: readonly string[];
  readonly styleInterview: {
    readonly language: 'pt-BR' | 'en-US';
    readonly tone: 'formal' | 'neutral' | 'casual';
    readonly skip: boolean;
  };
}

export interface WizardStepProps {
  readonly draft: WorkspaceSetupWizardDraft;
  readonly onChange: Dispatch<SetStateAction<WorkspaceSetupWizardDraft>>;
}

export function StepHeading({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function StepActions({
  onBack,
  onNext,
  nextDisabled,
}: {
  readonly onBack?: () => void;
  readonly onNext: () => void;
  readonly nextDisabled?: boolean;
}) {
  const { t } = useTranslate();
  return (
    <div className="flex justify-between gap-3 border-t border-foreground/6 pt-4">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          {t('workspace.wizard.back')}
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={onNext} disabled={nextDisabled}>
        {t('workspace.wizard.next')}
      </Button>
    </div>
  );
}
