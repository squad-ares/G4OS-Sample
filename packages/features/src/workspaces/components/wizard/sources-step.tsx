import { Switch, useTranslate } from '@g4os/ui';
import React from 'react';
import { DEFAULT_SOURCE_SEEDS } from '../../types.ts';
import { StepActions, StepHeading, type WizardStepProps } from './shared.tsx';

export function SourcesStep({
  draft,
  onChange,
  onBack,
  onNext,
}: WizardStepProps & { readonly onBack: () => void; readonly onNext: () => void }) {
  const { t } = useTranslate();

  const toggleSource = (slug: string) => {
    onChange((prev) => {
      const enabled = new Set(prev.enabledSources);
      if (enabled.has(slug)) enabled.delete(slug);
      else enabled.add(slug);
      return { ...prev, enabledSources: [...enabled] };
    });
  };

  return (
    <section className="flex flex-col gap-5">
      <StepHeading
        title={t('workspace.wizard.step.sources.title')}
        description={t('workspace.wizard.step.sources.description')}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {DEFAULT_SOURCE_SEEDS.map((source) => {
          const isEnabled = draft.enabledSources.includes(source.slug);
          return (
            <React.Fragment key={source.slug}>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: (reason: Switch renders a <button> internally; label provides accessible name for the toggle) */}
              <label
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-sm transition-colors ${
                  isEnabled ? 'border-accent/60 bg-accent/5' : 'border-foreground/10'
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {t(source.labelKey as Parameters<typeof t>[0])}
                  </span>
                  <span className="text-xs text-muted-foreground">{source.slug}</span>
                </span>
                <Switch checked={isEnabled} onCheckedChange={() => toggleSource(source.slug)} />
              </label>
            </React.Fragment>
          );
        })}
      </div>
      <StepActions onBack={onBack} onNext={onNext} />
    </section>
  );
}
