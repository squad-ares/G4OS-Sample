import { useTranslate } from '@g4os/ui';
import { CircleDot, GitBranch, Pin, Star } from 'lucide-react';
import type { SessionListItem } from '../types.ts';

export interface SessionListItemProps {
  readonly session: SessionListItem;
  readonly isActive: boolean;
  readonly onOpen: (id: string) => void;
  readonly onContextMenu?: (event: React.MouseEvent, session: SessionListItem) => void;
}

export function SessionListItemRow({
  session,
  isActive,
  onOpen,
  onContextMenu,
}: SessionListItemProps) {
  const { t } = useTranslate();
  const hasBranch = session.parentId !== undefined;
  const pinned = session.pinnedAt !== undefined;
  const starred = session.starredAt !== undefined;

  return (
    <button
      type="button"
      onClick={() => onOpen(session.id)}
      onContextMenu={(event) => onContextMenu?.(event, session)}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        isActive
          ? 'border-accent/60 bg-accent/5'
          : 'border-transparent hover:border-foreground/10 hover:bg-foreground/5'
      }`}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {session.unread ? (
            <CircleDot className="size-3 shrink-0 text-accent" aria-hidden={true} />
          ) : null}
          <span
            className={`truncate text-sm ${session.unread ? 'font-semibold' : 'font-medium'}`}
            title={session.name}
          >
            {session.name}
          </span>
          {pinned ? (
            <Pin
              className="size-3 shrink-0 text-foreground/60"
              aria-label={t('session.list.pinned')}
            />
          ) : null}
          {starred ? (
            <Star
              className="size-3 shrink-0 text-amber-400"
              aria-label={t('session.list.starred')}
            />
          ) : null}
          {hasBranch ? (
            <GitBranch
              className="size-3 shrink-0 text-foreground/60"
              aria-label={t('session.list.branch')}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatRelative(t, session.lastMessageAt ?? session.updatedAt)}</span>
          <span aria-hidden={true}>·</span>
          <span>
            {session.messageCount} {t('session.list.messages')}
          </span>
        </div>
      </div>
    </button>
  );
}

function formatRelative(t: ReturnType<typeof useTranslate>['t'], timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t('session.list.relative.justNow');
  if (mins < 60) return t('session.list.relative.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('session.list.relative.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('session.list.relative.daysAgo', { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t('session.list.relative.weeksAgo', { count: weeks });
  return new Date(timestamp).toLocaleDateString();
}
