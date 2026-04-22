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
                  {t(preset.labelKey as Parameters<typeof t>[0])}
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
            <SelectContent>
              <SelectItem value="minimal">{t('workspace.thinking.minimal')}</SelectItem>
              <SelectItem value="low">{t('workspace.thinking.low')}</SelectItem>
              <SelectItem value="medium">{t('workspace.thinking.medium')}</SelectItem>
              <SelectItem value="high">{t('workspace.thinking.high')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <StepActions onBack={onBack} onNext={onNext} />
    </section>
  );
}
