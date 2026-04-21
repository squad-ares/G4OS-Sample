import { ShellPageScaffold, ShellStatusPanel } from '@g4os/features/shell';
import { useTranslate } from '@g4os/ui';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/workspaces/')({
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const { t } = useTranslate();
  return (
    <ShellPageScaffold
      eyebrow={t('page.workspaces.badge')}
      title={t('page.workspaces.title')}
      description={t('page.workspaces.description')}
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <ShellStatusPanel
          title={t('page.workspaces.emptyTitle')}
          description={t('page.workspaces.emptyDescription')}
          badge={t('page.workspaces.contractBadge')}
        />
        <ShellStatusPanel
          title={t('page.workspaces.nextTitle')}
          description={t('page.workspaces.nextDescription')}
          tone="warning"
        />
      </div>
    </ShellPageScaffold>
  );
}
