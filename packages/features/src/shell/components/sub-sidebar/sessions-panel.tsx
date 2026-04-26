import type { Session } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { ChevronDown, GitBranch, Pin, SquarePen, Star, Tag } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { SubSidebarShell } from './sub-sidebar-shell.tsx';

export type SessionsSubTab = 'recent' | 'starred' | 'archived';

export interface SessionsPanelSessionItem {
  readonly id: string;
  readonly title: string;
  readonly timestamp?: string;
  /** Epoch ms usado para agrupar por dia. */
  readonly sortAt?: number;
  readonly active?: boolean;
  readonly pinned?: boolean;
  readonly starred?: boolean;
  readonly unread?: boolean;
  readonly branched?: boolean;
  readonly labels?: readonly string[];
}

export interface SessionsPanelProps {
  readonly sessions: readonly SessionsPanelSessionItem[];
  readonly activeTab: SessionsSubTab;
  readonly onTabChange: (next: SessionsSubTab) => void;
  readonly onOpenSession: (id: string) => void;
  readonly onNewSession: () => void;
  readonly loading?: boolean;
  readonly footer?: ReactNode;
  readonly tagsContent?: ReactNode;
}

export function SessionsPanel({
  sessions,
  activeTab,
  onTabChange,
  onOpenSession,
  onNewSession,
  loading = false,
  footer,
  tagsContent,
}: SessionsPanelProps) {
  const { t } = useTranslate();
  const [tagsOpen, setTagsOpen] = useState(false);

  const header = (
    <>
      <Button
        variant="outline"
        className="mb-3 h-10 w-full justify-start gap-2 rounded-[12px] px-3 text-sm font-semibold"
        onClick={onNewSession}
      >
        <SquarePen className="h-4 w-4" aria-hidden={true} />
        {t('shell.subsidebar.sessions.newSession')}
      </Button>

      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('shell.subsidebar.sessions.section')}
        </span>
      </div>

      <div className="flex items-center gap-1 border-b border-foreground/5 pb-1">
        <TabButton
          label={t('shell.subsidebar.sessions.tab.recent')}
          active={activeTab === 'recent'}
          onClick={() => onTabChange('recent')}
        />
        <TabButton
          label={t('shell.subsidebar.sessions.tab.starred')}
          active={activeTab === 'starred'}
          onClick={() => onTabChange('starred')}
        />
        <TabButton
          label={t('shell.subsidebar.sessions.tab.archived')}
          active={activeTab === 'archived'}
          onClick={() => onTabChange('archived')}
        />
      </div>
    </>
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <div className="flex min-h-0 flex-1 flex-col">
        {tagsContent ? (
          <div className="shrink-0 px-2">
            <button
              type="button"
              onClick={() => setTagsOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-foreground/[0.03]"
              aria-expanded={tagsOpen}
            >
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <Tag className="h-3.5 w-3.5" aria-hidden={true} />
                <span>{t('shell.subsidebar.sessions.tags')}</span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${tagsOpen ? 'rotate-180' : ''}`}
                aria-hidden={true}
              />
            </button>
            {tagsOpen ? (
              <div className="max-h-64 overflow-y-auto overscroll-contain pb-3 pr-1">
                {tagsContent}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col border-t border-foreground/5">
          <div className="shrink-0 px-4 pb-1 pt-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t('shell.subsidebar.sessions.history')}
            </span>
          </div>

          <div className="mask-fade-bottom min-h-0 flex-1 overflow-y-auto pb-3">
            {loading ? <SessionListSkeleton /> : null}
            {!loading && sessions.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                {t('shell.subsidebar.sessions.empty')}
              </p>
            ) : null}
            {!loading && sessions.length > 0 ? (
              <SessionGroups sessions={sessions} onOpenSession={onOpenSession} />
            ) : null}
          </div>
        </div>
      </div>
    </SubSidebarShell>
  );
}

interface SessionGroupsProps {
  readonly sessions: readonly SessionsPanelSessionItem[];
  readonly onOpenSession: (id: string) => void;
}

function SessionGroups({ sessions, onOpenSession }: SessionGroupsProps) {
  const groups = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  return (
    <div className="flex flex-col gap-2 px-2">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {group.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((session) => (
              <li key={session.id}>
                <SessionRow session={session} onOpen={onOpenSession} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface SessionRowProps {
  readonly session: SessionsPanelSessionItem;
  readonly onOpen: (id: string) => void;
}

function SessionRow({ session, onOpen }: SessionRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(session.id)}
      aria-current={session.active ? 'true' : undefined}
      className={`group flex w-full flex-col items-start gap-0.5 rounded-[10px] px-3 py-2 text-left transition-colors ${
        session.active
          ? 'bg-foreground/8 text-foreground'
          : 'text-foreground/85 hover:bg-foreground/5'
      }`}
    >
      <div className="flex w-full items-center gap-1.5">
        {session.unread ? (
          <span aria-hidden={true} className="size-1.5 shrink-0 rounded-full bg-accent" />
        ) : null}
        <span className="line-clamp-1 flex-1 text-[13px] font-medium">{session.title}</span>
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

interface SessionGroup {
  readonly key: string;
  readonly label: string;
  readonly items: readonly SessionsPanelSessionItem[];
}

const MS_PER_DAY = 86_400_000;

function groupSessionsByDay(
  sessions: readonly SessionsPanelSessionItem[],
): readonly SessionGroup[] {
  const today = startOfDay(Date.now());
  const buckets = new Map<string, { label: string; items: SessionsPanelSessionItem[] }>();
  const order: string[] = [];

  for (const s of sessions) {
    const sortAt = s.sortAt ?? today;
    const dayStart = startOfDay(sortAt);
    const diffDays = Math.round((today - dayStart) / MS_PER_DAY);
    const { key, label } = resolveBucket(diffDays, dayStart);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label, items: [] };
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.items.push(s);
  }

  return order.map((key) => {
    const b = buckets.get(key);
    if (!b) {
      return { key, label: key, items: [] };
    }
    return { key, label: b.label, items: b.items };
  });
}

function resolveBucket(diffDays: number, dayStart: number): { key: string; label: string } {
  if (diffDays <= 0) return { key: 'today', label: 'Today' };
  if (diffDays === 1) return { key: 'yesterday', label: 'Yesterday' };
  if (diffDays < 7) return { key: 'this-week', label: 'Earlier this week' };
  if (diffDays < 30) return { key: 'this-month', label: 'Earlier this month' };
  const d = new Date(dayStart);
  const key = `${d.getFullYear()}-${d.getMonth()}`;
  const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return { key, label };
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function TabButton({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-2 pb-2 text-[11px] font-medium transition-colors ${
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function SessionListSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-2">
      {['sk-a', 'sk-b', 'sk-c', 'sk-d', 'sk-e'].map((key) => (
        <div key={key} className="h-11 animate-pulse rounded-[10px] bg-foreground/5" />
      ))}
    </div>
  );
}

export function mapSessionToPanelItem(
  session: Session,
  activeSessionId?: string,
): SessionsPanelSessionItem {
  const sortAt = session.lastMessageAt ?? session.updatedAt;
  const timestamp = formatTimestamp(sortAt);
  return {
    id: session.id,
    title: session.name,
    sortAt,
    ...(timestamp ? { timestamp } : {}),
    active: activeSessionId === session.id,
    pinned: session.pinnedAt !== undefined,
    starred: session.starredAt !== undefined,
    unread: session.unread ?? false,
    branched: session.parentId !== undefined,
    labels: session.labels,
  };
}

function formatTimestamp(ms: number): string | undefined {
  try {
    const delta = Date.now() - ms;
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  } catch {
    return undefined;
  }
}
