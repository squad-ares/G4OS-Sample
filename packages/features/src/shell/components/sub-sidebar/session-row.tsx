import { FolderKanban, GitBranch, Loader2, type LucideIcon, Pin, Star } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { HighlightedTitle } from './sessions-panel-states.tsx';

export interface SessionRowItem {
  readonly id: string;
  readonly title: string;
  readonly active?: boolean;
  readonly pinned?: boolean;
  readonly starred?: boolean;
  readonly unread?: boolean;
  readonly streaming?: boolean;
  readonly branched?: boolean;
  readonly timestamp?: string;
  readonly projectName?: string;
  readonly labels?: readonly string[];
}

export interface SessionRowProps {
  readonly session: SessionRowItem;
  readonly onOpen: (id: string) => void;
  readonly searchQuery?: string | undefined;
  readonly onContextMenu?: (event: ReactMouseEvent<HTMLElement>, session: SessionRowItem) => void;
}

export function SessionRow({ session, onOpen, searchQuery, onContextMenu }: SessionRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(session.id)}
      onContextMenu={onContextMenu ? (event) => onContextMenu(event, session) : undefined}
      aria-current={session.active ? 'true' : undefined}
      className={`group flex w-full flex-col items-start gap-0.5 rounded-[10px] px-3 py-2 text-left transition-colors ${
        session.active ? 'bg-foreground/8 text-foreground' : 'text-foreground/85 hover:bg-accent/12'
      }`}
    >
      <div className="flex w-full items-center gap-1.5">
        {session.streaming ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-accent" aria-hidden={true} />
        ) : session.unread ? (
          <span aria-hidden={true} className="size-1.5 shrink-0 rounded-full bg-accent" />
        ) : null}
        <span className="line-clamp-1 flex-1 text-[13px] font-medium">
          {searchQuery ? (
            <HighlightedTitle text={session.title} query={searchQuery} />
          ) : (
            session.title
          )}
        </span>
        {session.pinned ? (
          <Pin className="size-3 shrink-0 text-muted-foreground" aria-hidden={true} />
        ) : null}
        {session.starred ? (
          <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden={true} />
        ) : null}
        {session.branched ? (
          <GitBranch className="size-3 shrink-0 text-muted-foreground" aria-hidden={true} />
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {session.timestamp ? <span>{session.timestamp}</span> : null}
        {session.projectName ? (
          <span className="flex items-center gap-1 truncate text-foreground/65">
            <FolderKanban className="size-2.5 shrink-0" aria-hidden={true} />
            <span className="truncate">{session.projectName}</span>
          </span>
        ) : null}
        {session.labels?.slice(0, 2).map((label) => (
          <span
            key={label}
            className="rounded-full bg-foreground/6 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-foreground/70"
          >
            {label}
          </span>
        ))}
      </div>
    </button>
  );
}

export function TabIconButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      title={label}
      className={`flex h-7 w-9 items-center justify-center rounded-md border-b-2 transition-colors ${
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-accent/12 hover:text-foreground'
      }`}
    >
      <Icon className="size-3.5" aria-hidden={true} />
    </button>
  );
}
