import { Button, useTranslate } from '@g4os/ui';
import { StepHeading, type WorkspaceSetupWizardDraft } from './shared.tsx';

export function FinishStep({
  draft,
  submitting,
  onBack,
  onSubmit,
}: {
  readonly draft: WorkspaceSetupWizardDraft;
  readonly submitting: boolean;
  readonly onBack: () => void;
  readonly onSubmit: () => void | Promise<void>;
}) {
  const { t } = useTranslate();
  const sourcesLabel = t('workspace.wizard.step.finish.sourcesCount', {
    count: String(draft.enabledSources.length),
  });

  return (
    <section className="flex flex-col gap-5">
      <StepHeading
        title={t('workspace.wizard.step.finish.title')}
        description={t('workspace.wizard.step.finish.description')}
      />

      <dl className="grid gap-2 text-sm">
        <Summary label={t('workspace.wizard.step.finish.nameLabel')} value={draft.name} />
        <Summary
          label={t('workspace.wizard.step.finish.permissionLabel')}
          value={t(
            `workspace.permissions.preset.${draft.defaults.permissionPreset}.label` as Parameters<
              typeof t
            >[0],
          )}
        />
        <Summary
          label={t('workspace.wizard.step.finish.thinkingLabel')}
          value={t(`workspace.thinking.${draft.defaults.thinkingLevel}` as Parameters<typeof t>[0])}
        />
        <Summary label={t('workspace.wizard.step.finish.sourcesLabel')} value={sourcesLabel} />
      </dl>

      <div className="flex justify-between gap-3 border-t border-foreground/6 pt-4">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          {t('workspace.wizard.back')}
        </Button>
        <Button onClick={() => void onSubmit()} disabled={submitting}>
          {submitting
            ? t('workspace.wizard.step.finish.submitting')
            : t('workspace.wizard.step.finish.submit')}
        </Button>
      </div>
    </section>
  );
}

function Summary({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-foreground/3 px-3 py-2">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
