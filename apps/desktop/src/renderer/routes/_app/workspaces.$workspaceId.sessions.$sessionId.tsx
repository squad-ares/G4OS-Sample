import { ShellPageScaffold, ShellStatusPanel } from '@g4os/features/shell';
import { useTranslate } from '@g4os/ui';
import { createFileRoute } from '@tanstack/react-router';

function SessionPage() {
  const { t } = useTranslate();
  const { workspaceId, sessionId } = Route.useParams();
  return (
    <ShellPageScaffold
      eyebrow={t('page.session.badge')}
      title={t('page.session.title')}
      description={t('page.session.meta', { workspaceId, sessionId })}
    >
      <ShellStatusPanel
        title={t('page.session.pendingTitle')}
        description={t('page.session.pending')}
        badge={t('page.session.contractBadge')}
      />
    </ShellPageScaffold>
  );
}

export const Route = createFileRoute('/_app/workspaces/$workspaceId/sessions/$sessionId')({
  component: SessionPage,
});
