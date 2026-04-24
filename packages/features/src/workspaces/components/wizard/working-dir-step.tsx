import { Input, Label, useTranslate } from '@g4os/ui';
import { useId } from 'react';
import { StepActions, StepHeading, type WizardStepProps } from './shared.tsx';

export function WorkingDirStep({
  draft,
  onChange,
  onBack,
  onNext,
}: WizardStepProps & { readonly onBack: () => void; readonly onNext: () => void }) {
  const { t } = useTranslate();
  const id = useId();

  return (
    <section className="flex flex-col gap-5">
      <StepHeading
        title={t('workspace.wizard.step.workingDir.title')}
        description={t('workspace.wizard.step.workingDir.description')}
      />
      <div className="space-y-2">
        <Label htmlFor={id}>{t('workspace.wizard.step.workingDir.label')}</Label>
        <Input
          id={id}
          value={draft.workingDirectory}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, workingDirectory: event.target.value }))
          }
          placeholder={t('workspace.wizard.step.workingDir.placeholder')}
        />
        <p className="text-xs text-muted-foreground">
          {t('workspace.wizard.step.workingDir.hint')}
        </p>
      </div>
      <StepActions onBack={onBack} onNext={onNext} />
    </section>
  );
}
