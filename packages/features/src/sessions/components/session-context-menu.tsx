/**
 * Menu flutuante de ações sobre uma sessão (pin, star, read, archive,
 * delete, restore, branch). Props controlam visibilidade + posição —
 * componente declarativo; o consumidor controla com onClose.
 *
 * Deriva ações disponíveis do `lifecycle` + flags: sessão deletada só
 * expõe `restore`/`deleteForever`; arquivada expõe `restore`/`delete`.
 */

import { useTranslate } from '@g4os/ui';
import {
  Archive,
  CircleDot,
  GitBranch,
  PencilLine,
  Pin,
  PinOff,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { SessionListItem } from '../types.ts';

export interface SessionContextMenuProps {
  readonly open: boolean;
  readonly position: { readonly x: number; readonly y: number };
  readonly session: SessionListItem;
  readonly onClose: () => void;
  readonly onPin: (id: string, pinned: boolean) => void;
  readonly onStar: (id: string, starred: boolean) => void;
  readonly onMarkRead: (id: string, unread: boolean) => void;
  readonly onRename?: (id: string) => void;
  readonly onArchive: (id: string) => void;
  readonly onRestore: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onBranch?: (id: string) => void;
}

export function SessionContextMenu({
  open,
  position,
  session,
  onClose,
  onPin,
  onStar,
  onMarkRead,
  onRename,
  onArchive,
  onRestore,
  onDelete,
  onBranch,
}: SessionContextMenuProps) {
  const { t } = useTranslate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isPinned = session.pinnedAt !== undefined;
  const isStarred = session.starredAt !== undefined;
  const lifecycle = session.lifecycle;

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 flex min-w-52 flex-col gap-0.5 rounded-[10px] border border-foreground/8 bg-background/96 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm"
      style={{ top: position.y, left: position.x }}
    >
      {lifecycle === 'active' ? (
        <>
          <Item
            onSelect={() => {
              onPin(session.id, !isPinned);
              onClose();
            }}
            icon={
              isPinned ? (
                <PinOff className="size-4" aria-hidden={true} />
              ) : (
                <Pin className="size-4" aria-hidden={true} />
              )
            }
            label={t(isPinned ? 'session.action.unpin' : 'session.action.pin')}
          />
          <Item
            onSelect={() => {
              onStar(session.id, !isStarred);
              onClose();
            }}
            icon={
              isStarred ? (
                <StarOff className="size-4" aria-hidden={true} />
              ) : (
                <Star className="size-4" aria-hidden={true} />
              )
            }
            label={t(isStarred ? 'session.action.unstar' : 'session.action.star')}
          />
          <Item
            onSelect={() => {
              onMarkRead(session.id, !session.unread);
              onClose();
            }}
            icon={<CircleDot className="size-4" aria-hidden={true} />}
            label={t(session.unread ? 'session.action.markRead' : 'session.action.markUnread')}
          />
          {onBranch ? (
            <Item
              onSelect={() => {
                onBranch(session.id);
                onClose();
              }}
              icon={<GitBranch className="size-4" aria-hidden={true} />}
              label={t('session.action.branch')}
            />
          ) : null}
          {onRename ? (
            <Item
              onSelect={() => {
                onRename(session.id);
                onClose();
              }}
              icon={<PencilLine className="size-4" aria-hidden={true} />}
              label={t('session.action.rename')}
            />
          ) : null}
          <Separator />
          <Item
            onSelect={() => {
              onArchive(session.id);
              onClose();
            }}
            icon={<Archive className="size-4" aria-hidden={true} />}
            label={t('session.action.archive')}
          />
          <Item
            danger={true}
            onSelect={() => {
              onDelete(session.id);
              onClose();
            }}
            icon={<Trash2 className="size-4" aria-hidden={true} />}
            label={t('session.action.delete')}
          />
        </>
      ) : (
        <>
          <Item
            onSelect={() => {
              onRestore(session.id);
              onClose();
            }}
            icon={<RotateCcw className="size-4" aria-hidden={true} />}
            label={t('session.action.restore')}
          />
          <Item
            danger={true}
            onSelect={() => {
              onDelete(session.id);
              onClose();
            }}
            icon={<Trash2 className="size-4" aria-hidden={true} />}
            label={t('session.action.deleteForever')}
          />
        </>
      )}
    </div>
  );
}

interface ItemProps {
  readonly onSelect: () => void;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly danger?: boolean;
}

function Item({ onSelect, icon, label, danger }: ItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent/12'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Separator() {
  return <div aria-hidden={true} className="my-1 h-px bg-foreground/6" />;
}
