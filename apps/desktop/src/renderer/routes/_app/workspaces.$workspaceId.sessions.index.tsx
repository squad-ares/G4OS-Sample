import {
  GlobalSearch,
  NewSessionButton,
  SessionContextMenu,
  SessionFilterBar,
  SessionLifecycleDialog,
  type SessionLifecycleDialogKind,
  SessionList,
  type SessionListItem,
  useSessionShortcuts,
} from '@g4os/features/sessions';
import { useTranslate } from '@g4os/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useSessionsPage } from '../../sessions/use-sessions-page.ts';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/sessions/')({
  component: SessionsListPage,
});

function SessionsListPage() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const { workspaceId } = Route.useParams();
  const page = useSessionsPage(workspaceId);

  const [contextMenu, setContextMenu] = useState<{
    readonly session: SessionListItem;
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    readonly kind: SessionLifecycleDialogKind;
    readonly session: SessionListItem;
  } | null>(null);

  useSessionShortcuts({
    onNewSession: () => handleCreate(),
    onOpenSearch: () => page.openSearch(),
  });

  const handleCreate = async (): Promise<void> => {
    const created = await page.createSession();
    if (created) {
      await navigate({
        to: '/workspaces/$workspaceId/sessions/$sessionId',
        params: { workspaceId, sessionId: created.id },
      });
    }
  };

  const handleOpen = (id: string): void => {
    void navigate({
      to: '/workspaces/$workspaceId/sessions/$sessionId',
      params: { workspaceId, sessionId: id },
    });
  };

  const handleLifecycleConfirm = async (): Promise<void> => {
    if (!lifecycleDialog) return;
    const { kind, session } = lifecycleDialog;
    if (kind === 'archive') await page.archive(session.id);
    else if (kind === 'delete') await page.softDelete(session.id);
    else if (kind === 'restore') await page.restore(session.id);
    setLifecycleDialog(null);
  };

  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t('session.list.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('session.list.description')}</p>
        </div>
        <NewSessionButton onClick={handleCreate} />
      </header>
      <SessionFilterBar filters={page.filters} onChange={page.setFilters} />
      <div className="min-h-0 flex-1 rounded-xl border">
        <SessionList
          sessions={page.items}
          activeSessionId={null}
          isLoading={page.isLoading}
          onOpen={handleOpen}
          onCreate={handleCreate}
          onContextMenu={(event, session) => {
            event.preventDefault();
            setContextMenu({ session, x: event.clientX, y: event.clientY });
          }}
        />
      </div>
      {contextMenu ? (
        <SessionContextMenu
          open={true}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          session={contextMenu.session}
          onClose={() => setContextMenu(null)}
          onPin={(id, pinned) => page.pin(id, pinned)}
          onStar={(id, starred) => page.star(id, starred)}
          onMarkRead={(id, unread) => page.markRead(id, unread)}
          onArchive={(id) => {
            const session = page.items.find((s) => s.id === id);
            if (session) setLifecycleDialog({ kind: 'archive', session });
          }}
          onRestore={(id) => {
            const session = page.items.find((s) => s.id === id);
            if (session) setLifecycleDialog({ kind: 'restore', session });
          }}
          onDelete={(id) => {
            const session = page.items.find((s) => s.id === id);
            if (session) setLifecycleDialog({ kind: 'delete', session });
          }}
        />
      ) : null}
      {lifecycleDialog ? (
        <SessionLifecycleDialog
          open={true}
          kind={lifecycleDialog.kind}
          sessionName={lifecycleDialog.session.name}
          onConfirm={handleLifecycleConfirm}
          onCancel={() => setLifecycleDialog(null)}
        />
      ) : null}
      <GlobalSearch
        open={page.searchOpen}
        query={page.searchQuery}
        results={page.searchResults}
        onQueryChange={page.setSearchQuery}
        onOpenChange={(next) => (next ? page.openSearch() : page.closeSearch())}
        onSelectSession={handleOpen}
        onSelectMessage={(sessionId) => handleOpen(sessionId)}
      />
    </div>
  );
}
