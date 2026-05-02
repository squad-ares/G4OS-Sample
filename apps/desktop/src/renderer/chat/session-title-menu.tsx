/**
 * CR-28 F-CR28-1 — Menu de ações da sessão ancorado no `SessionTitleBar`.
 * Substitui o V1 `SessionMenu` chevron+dropdown que existia no `PanelHeader`
 * via `titleMenu` slot. Paridade V1 mantendo chrome leve do ADR-0156.
 *
 * Ações expostas:
 *   - Pin / Unpin
 *   - Star / Unstar
 *   - Mark unread / Mark read
 *   - Archive (active) ou Restore (archived)
 *   - Open in new window (via `windowsService.openWorkspaceWindow` —
 *     V2 ainda não tem session-scoped window, abre o workspace pai)
 *   - Delete (destrutivo, com confirm)
 *
 * Renderer-only — toda lógica IPC vive aqui pra que `SessionTitleBar`
 * fique um componente puro de apresentação no `@g4os/features`.
 */

import type { Session, SessionLifecycle } from '@g4os/kernel/types';
import {
  Button,
  ConfirmDestructiveDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
  useTranslate,
} from '@g4os/ui';
import {
  Archive,
  ArrowUpRight,
  CircleDot,
  MoreHorizontal,
  Pin,
  PinOff,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';
import { invalidateSessions } from '../sessions/sessions-store.ts';

interface SessionTitleMenuProps {
  readonly session: Session;
  /** Callback após archive — usado pelo route pra navegar pra lista. */
  readonly onAfterArchive?: () => void;
  /** Callback após delete — usado pelo route pra navegar pra lista. */
  readonly onAfterDelete?: () => void;
}

export function SessionTitleMenu({
  session,
  onAfterArchive,
  onAfterDelete,
}: SessionTitleMenuProps) {
  const { t } = useTranslate();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isPinned = session.pinnedAt !== undefined;
  const isStarred = session.starredAt !== undefined;
  const isUnread = session.unread;
  const lifecycle: SessionLifecycle = session.lifecycle;

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([
      invalidateSessions(queryClient),
      queryClient.invalidateQueries({ queryKey: ['sessions', 'get', session.id] }),
    ]);
  }, [session.id]);

  const togglePin = useCallback(async () => {
    try {
      await trpc.sessions.pin.mutate({ id: session.id, pinned: !isPinned });
      await refresh();
    } catch (err) {
      toast.error(String(err));
    }
  }, [session.id, isPinned, refresh]);

  const toggleStar = useCallback(async () => {
    try {
      await trpc.sessions.star.mutate({ id: session.id, starred: !isStarred });
      await refresh();
    } catch (err) {
      toast.error(String(err));
    }
  }, [session.id, isStarred, refresh]);

  const toggleUnread = useCallback(async () => {
    try {
      await trpc.sessions.markRead.mutate({ id: session.id, unread: !isUnread });
      await refresh();
    } catch (err) {
      toast.error(String(err));
    }
  }, [session.id, isUnread, refresh]);

  const archive = useCallback(async () => {
    try {
      await trpc.sessions.archive.mutate({ id: session.id });
      await refresh();
      onAfterArchive?.();
    } catch (err) {
      toast.error(String(err));
    }
  }, [session.id, refresh, onAfterArchive]);

  const restore = useCallback(async () => {
    try {
      await trpc.sessions.restore.mutate({ id: session.id });
      await refresh();
    } catch (err) {
      toast.error(String(err));
    }
  }, [session.id, refresh]);

  const openInNewWindow = useCallback(async () => {
    try {
      // V2 ainda não tem session-scoped window. Abre o workspace; usuário
      // navega à sessão. Follow-up: estender WindowsService com
      // `openSessionWindow(sessionId)` pra paridade total V1.
      await trpc.windows.openWorkspaceWindow.mutate({ workspaceId: session.workspaceId });
    } catch (err) {
      toast.error(String(err));
    }
  }, [session.workspaceId]);

  const confirmDelete = useCallback(async () => {
    try {
      await trpc.sessions.delete.mutate({ id: session.id, confirm: true });
      await refresh();
      setConfirmDeleteOpen(false);
      onAfterDelete?.();
    } catch (err) {
      toast.error(String(err));
    }
  }, [session.id, refresh, onAfterDelete]);

  const menuItems = useMemo(() => {
    if (lifecycle !== 'active') {
      return (
        <>
          <DropdownMenuItem onClick={() => void restore()}>
            <RotateCcw className="size-4" aria-hidden={true} />
            <span>{t('session.action.restore')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteOpen(true)}>
            <Trash2 className="size-4" aria-hidden={true} />
            <span>{t('session.action.deleteForever')}</span>
          </DropdownMenuItem>
        </>
      );
    }
    return (
      <>
        <DropdownMenuItem onClick={() => void togglePin()}>
          {isPinned ? (
            <PinOff className="size-4" aria-hidden={true} />
          ) : (
            <Pin className="size-4" aria-hidden={true} />
          )}
          <span>{t(isPinned ? 'session.action.unpin' : 'session.action.pin')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void toggleStar()}>
          {isStarred ? (
            <StarOff className="size-4" aria-hidden={true} />
          ) : (
            <Star className="size-4" aria-hidden={true} />
          )}
          <span>{t(isStarred ? 'session.action.unstar' : 'session.action.star')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void toggleUnread()}>
          <CircleDot className="size-4" aria-hidden={true} />
          <span>{t(isUnread ? 'session.action.markRead' : 'session.action.markUnread')}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void openInNewWindow()}>
          <ArrowUpRight className="size-4" aria-hidden={true} />
          <span>{t('session.action.openInNewWindow')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void archive()}>
          <Archive className="size-4" aria-hidden={true} />
          <span>{t('session.action.archive')}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteOpen(true)}>
          <Trash2 className="size-4" aria-hidden={true} />
          <span>{t('session.action.delete')}</span>
        </DropdownMenuItem>
      </>
    );
  }, [
    lifecycle,
    isPinned,
    isStarred,
    isUnread,
    togglePin,
    toggleStar,
    toggleUnread,
    archive,
    restore,
    openInNewWindow,
    t,
  ]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild={true}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('chat.header.openSessionMenu')}
            title={t('chat.header.openSessionMenu')}
            className="size-7"
          >
            <MoreHorizontal className="size-4" aria-hidden={true} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDestructiveDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t('session.deleteDialog.title')}
        description={t('session.deleteDialog.description', { name: session.name })}
        confirmLabel={t('session.action.delete')}
        cancelLabel={t('session.deleteDialog.cancel')}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
