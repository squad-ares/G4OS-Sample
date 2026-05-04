import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useTranslate,
} from '@g4os/ui';
import { PERMISSION_PRESETS, type PermissionPreset, type ThinkingLevel } from '../../types.ts';
import { StepActions, StepHeading, type WizardStepProps } from './shared.tsx';

// CR-37 F-CR37-1: mapa tipado evita cast `as TranslationKey` por site.
const THINKING_LEVEL_KEYS: Record<
  ThinkingLevel,
  Parameters<ReturnType<typeof useTranslate>['t']>[0]
> = {
  low: 'workspace.thinking.low',
  think: 'workspace.thinking.think',
  high: 'workspace.thinking.high',
  ultra: 'workspace.thinking.ultra',
};

export function DefaultsStep({
  draft,
  onChange,
  onBack,
  onNext,
}: WizardStepProps & { readonly onBack: () => void; readonly onNext: () => void }) {
  const { t } = useTranslate();

  return (
    <section className="flex flex-col gap-5">
      <StepHeading
        title={t('workspace.wizard.step.defaults.title')}
        description={t('workspace.wizard.step.defaults.description')}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('workspace.wizard.step.defaults.permissionPreset')}</Label>
          <Select
            value={draft.defaults.permissionPreset}
            onValueChange={(value: string) =>
              onChange((prev) => ({
                ...prev,
                defaults: { ...prev.defaults, permissionPreset: value as PermissionPreset },
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERMISSION_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {t(preset.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('workspace.wizard.step.defaults.thinkingLevel')}</Label>
          <Select
            value={draft.defaults.thinkingLevel}
            onValueChange={(value: string) =>
              onChange((prev) => ({
                ...prev,
                defaults: { ...prev.defaults, thinkingLevel: value as ThinkingLevel },
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            {/* CR-37 F-CR37-1: valores canônicos low/think/high/ultra (não minimal/medium). */}
            <SelectContent>
              {(Object.keys(THINKING_LEVEL_KEYS) as ThinkingLevel[]).map((level) => (
                <SelectItem key={level} value={level}>
                  {t(THINKING_LEVEL_KEYS[level])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <StepActions onBack={onBack} onNext={onNext} />
    </section>
  );
}
