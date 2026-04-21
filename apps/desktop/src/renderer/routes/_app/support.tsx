import { ShellPageScaffold, ShellStatusPanel, ShortcutsList } from '@g4os/features/shell';
import { useTranslate } from '@g4os/ui';
import { createFileRoute } from '@tanstack/react-router';

function SupportPage() {
  const { t } = useTranslate();

  return (
    <ShellPageScaffold
      eyebrow={t('page.support.badge')}
      title={t('page.support.title')}
      description={t('page.support.description')}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ShellStatusPanel
          title={t('page.support.shortcutsTitle')}
          description={t('page.support.shortcutsDescription')}
          badge={t('page.support.shortcutsBadge')}
        >
          <ShortcutsList />
        </ShellStatusPanel>
        <ShellStatusPanel
          title={t('page.support.a11yTitle')}
          description={t('page.support.a11yDescription')}
          tone="warning"
        />
      </div>
    </ShellPageScaffold>
  );
}

export const Route = createFileRoute('/_app/support')({
  component: SupportPage,
});
