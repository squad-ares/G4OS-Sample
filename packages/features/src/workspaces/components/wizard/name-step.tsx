import { Input, Label, useTranslate } from '@g4os/ui';
import React, { useId } from 'react';
import { WORKSPACE_COLORS } from '../../types.ts';
import { StepActions, StepHeading, type WizardStepProps } from './shared.tsx';

export function NameStep({
  draft,
  onChange,
  onNext,
}: WizardStepProps & { readonly onNext: () => void }) {
  const { t } = useTranslate();
  const nameId = useId();
  const colorId = useId();
  const canAdvance = draft.name.trim().length >= 2;

  return (
    <section className="flex flex-col gap-5">
      <StepHeading
        title={t('workspace.wizard.step.name.title')}
        description={t('workspace.wizard.step.name.description')}
      />
      <div className="space-y-2">
        <Label htmlFor={nameId}>{t('workspace.wizard.step.name.label')}</Label>
        <Input
          id={nameId}
          value={draft.name}
          onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
          autoFocus={true}
          placeholder={t('workspace.wizard.step.name.placeholder')}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={colorId}>{t('workspace.wizard.step.name.color')}</Label>
        <div id={colorId} role="radiogroup" className="flex flex-wrap gap-2">
          {WORKSPACE_COLORS.map((color) => {
            const isSelected = draft.color === color.id;
            return (
              <React.Fragment key={color.id}>
                {/* biome-ignore lint/a11y/useSemanticElements: (reason: visual color picker; <button> with explicit role provides better styling than hidden <input type="radio">) */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onChange((prev) => ({ ...prev, color: color.id }))}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-foreground/12 text-foreground/70 hover:border-foreground/30'
                  }`}
                >
                  <span
                    aria-hidden={true}
                    className="size-3 rounded-full"
                    style={{ backgroundColor: color.hex }}
                  />
                  {t(color.labelKey)}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <StepActions onNext={onNext} nextDisabled={!canAdvance} />
    </section>
  );
}
