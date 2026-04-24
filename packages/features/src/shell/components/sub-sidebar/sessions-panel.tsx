import type { Session } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { ChevronDown, SquarePen, Tag } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { SubSidebarShell } from './sub-sidebar-shell.tsx';

export type SessionsSubTab = 'recent' | 'starred' | 'archived';

export interface SessionsPanelSessionItem {
  readonly id: string;
  readonly title: string;
  readonly timestamp?: string;
  readonly active?: boolean;
  readonly pinned?: boolean;
  readonly starred?: boolean;
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
              <ul className="flex flex-col gap-0.5 px-2">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => onOpenSession(session.id)}
                      aria-current={session.active ? 'true' : undefined}
                      className={`group flex w-full flex-col items-start gap-0.5 rounded-[10px] px-3 py-2 text-left transition-colors ${
                        session.active
                          ? 'bg-foreground/8 text-foreground'
                          : 'text-foreground/85 hover:bg-foreground/5'
                      }`}
                    >
                      <span className="line-clamp-1 text-[13px] font-medium">{session.title}</span>
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
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </SubSidebarShell>
  );
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
  const timestamp = session.lastMessageAt
    ? formatTimestamp(session.lastMessageAt)
    : formatTimestamp(session.updatedAt);
  return {
    id: session.id,
    title: session.name,
    ...(timestamp ? { timestamp } : {}),
    active: activeSessionId === session.id,
    pinned: session.pinnedAt !== undefined,
    starred: session.starredAt !== undefined,
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
