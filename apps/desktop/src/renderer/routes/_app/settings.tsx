import { ShellPageScaffold, ShellStatusPanel, ShortcutsList } from '@g4os/features/shell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useTranslate,
} from '@g4os/ui';
import { createFileRoute } from '@tanstack/react-router';

function SettingsPage() {
  const { locale, setLocale, t } = useTranslate();
  return (
    <ShellPageScaffold
      eyebrow={t('page.settings.badge')}
      title={t('page.settings.title')}
      description={t('page.settings.description')}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ShellStatusPanel
          title={t('page.settings.localeTitle')}
          description={t('page.settings.localeDescription')}
          badge={t('page.settings.localeBadge')}
        >
          <div className="max-w-xs">
            <Select value={locale} onValueChange={(value) => setLocale(value as typeof locale)}>
              <SelectTrigger aria-label={t('page.settings.localeAriaLabel')}>
                <SelectValue placeholder={t('page.settings.localePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">{t('locale.pt-BR')}</SelectItem>
                <SelectItem value="en-US">{t('locale.en-US')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </ShellStatusPanel>
        <ShellStatusPanel
          title={t('page.settings.shortcutsTitle')}
          description={t('page.settings.shortcutsDescription')}
          tone="warning"
        >
          <ShortcutsList />
        </ShellStatusPanel>
      </div>
    </ShellPageScaffold>
  );
}

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});
