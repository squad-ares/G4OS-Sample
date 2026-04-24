import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useTranslate,
} from '@g4os/ui';
import { StepActions, StepHeading, type WizardStepProps } from './shared.tsx';

export function StyleStep({
  draft,
  onChange,
  onBack,
  onNext,
}: WizardStepProps & { readonly onBack: () => void; readonly onNext: () => void }) {
  const { t } = useTranslate();

  return (
    <section className="flex flex-col gap-5">
      <StepHeading
        title={t('workspace.wizard.step.style.title')}
        description={t('workspace.wizard.step.style.description')}
      />

      <div className="flex items-center justify-between rounded-2xl border border-foreground/10 px-4 py-3">
        <div>
          <div className="text-sm font-medium">{t('workspace.wizard.step.style.skipLabel')}</div>
          <div className="text-xs text-muted-foreground">
            {t('workspace.wizard.step.style.skipDescription')}
          </div>
        </div>
        <Switch
          checked={draft.styleInterview.skip}
          onCheckedChange={(checked) =>
            onChange((prev) => ({
              ...prev,
              styleInterview: { ...prev.styleInterview, skip: checked },
            }))
          }
        />
      </div>

      {draft.styleInterview.skip ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('workspace.wizard.step.style.language')}</Label>
            <Select
              value={draft.styleInterview.language}
              onValueChange={(value: string) =>
                onChange((prev) => ({
                  ...prev,
                  styleInterview: {
                    ...prev.styleInterview,
                    language: value as 'pt-BR' | 'en-US',
                  },
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">{t('workspace.language.ptBR')}</SelectItem>
                <SelectItem value="en-US">{t('workspace.language.enUS')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('workspace.wizard.step.style.tone')}</Label>
            <Select
              value={draft.styleInterview.tone}
              onValueChange={(value: string) =>
                onChange((prev) => ({
                  ...prev,
                  styleInterview: {
                    ...prev.styleInterview,
                    tone: value as 'formal' | 'neutral' | 'casual',
                  },
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">{t('workspace.tone.formal')}</SelectItem>
                <SelectItem value="neutral">{t('workspace.tone.neutral')}</SelectItem>
                <SelectItem value="casual">{t('workspace.tone.casual')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <StepActions onBack={onBack} onNext={onNext} />
    </section>
  );
}
