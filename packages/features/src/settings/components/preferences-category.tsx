import { useTranslate } from '@g4os/ui';
import { ShellStatusPanel } from '../../shell/index.ts';

export interface PreferencesCategoryProps {
  readonly seenNewsCount: number;
  readonly onResetSeenNews: () => void;
  readonly onResetAll: () => void;
}

export function PreferencesCategory({
  seenNewsCount,
  onResetSeenNews,
  onResetAll,
}: PreferencesCategoryProps) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <ShellStatusPanel
        title={t('settings.preferences.news.title')}
        description={t('settings.preferences.news.description')}
        badge={t('settings.category.preferences.label')}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t('settings.preferences.news.seenCount', { count: seenNewsCount })}
          </p>
          <button
            type="button"
            onClick={onResetSeenNews}
            disabled={seenNewsCount === 0}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
          >
            {t('settings.preferences.news.reset')}
          </button>
        </div>
      </ShellStatusPanel>

      <ShellStatusPanel
        title={t('settings.preferences.resetAll.title')}
        description={t('settings.preferences.resetAll.description')}
        tone="warning"
      >
        <button
          type="button"
          onClick={onResetAll}
          className="rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive/10"
        >
          {t('settings.preferences.resetAll.action')}
        </button>
      </ShellStatusPanel>
    </div>
  );
}
