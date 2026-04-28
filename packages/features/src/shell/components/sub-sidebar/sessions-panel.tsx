import type { Session } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import {
  Archive,
  Bell,
  ChevronDown,
  Clock,
  Pin,
  Search,
  SquarePen,
  Star,
  Tag,
  X,
} from 'lucide-react';
import { type MouseEvent as ReactMouseEvent, type ReactNode, useMemo, useState } from 'react';
import { SessionRow, TabIconButton } from './session-row.tsx';
import { groupSessionsByDay } from './sessions-panel-grouping.ts';
import {
  NoSearchResults,
  SessionListSkeleton,
  SessionsEmptyState,
} from './sessions-panel-states.tsx';
import type { SessionsPanelSessionItem, SessionsSubTab } from './sessions-panel-types.ts';
import { SubSidebarShell } from './sub-sidebar-shell.tsx';

export type { SessionsPanelSessionItem, SessionsSubTab } from './sessions-panel-types.ts';

export interface SessionsPanelProps {
  readonly sessions: readonly SessionsPanelSessionItem[];
  readonly activeTab: SessionsSubTab;
  readonly onTabChange: (next: SessionsSubTab) => void;
  readonly onOpenSession: (id: string) => void;
  /**
   * Callback de criar nova sessão. **Opcional** — quando ausente, o panel
   * esconde o botão "Nova sessão" e o CTA do empty state. Útil em estados
   * onde não há workspace ativo (sem destino para alocar a sessão).
   */
  readonly onNewSession?: () => void;
  readonly loading?: boolean;
  readonly footer?: ReactNode;
  readonly tagsContent?: ReactNode;
  /**
   * Handler de menu de contexto (clique direito) numa session da lista.
   * Quando fornecido, o panel intercepta `onContextMenu` em cada item.
   * Caller é responsável por renderizar o `SessionContextMenu` flutuante.
   */
  readonly onSessionContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    session: SessionsPanelSessionItem,
  ) => void;
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
  onSessionContextMenu,
}: SessionsPanelProps) {
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim();
  const filteredSessions = useMemo(() => {
    if (trimmedQuery.length === 0) return sessions;
    const q = trimmedQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, trimmedQuery]);
  const isSearching = trimmedQuery.length > 0;

  const header = (
    <SessionsPanelHeader
      activeTab={activeTab}
      onTabChange={onTabChange}
      {...(onNewSession ? { onNewSession } : {})}
      query={query}
      onQueryChange={setQuery}
      isSearching={isSearching}
      matchCount={filteredSessions.length}
    />
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <div className="flex min-h-0 flex-1 flex-col">
        {tagsContent ? <TagsToggle tagsContent={tagsContent} /> : null}
        <SessionsListBody
          loading={loading}
          totalCount={sessions.length}
          filteredSessions={filteredSessions}
          isSearching={isSearching}
          query={trimmedQuery}
          onClearSearch={() => setQuery('')}
          {...(onNewSession ? { onNewSession } : {})}
          onOpenSession={onOpenSession}
          {...(onSessionContextMenu ? { onSessionContextMenu } : {})}
        />
      </div>
    </SubSidebarShell>
  );
}

interface SessionsPanelHeaderProps {
  readonly activeTab: SessionsSubTab;
  readonly onTabChange: (next: SessionsSubTab) => void;
  readonly onNewSession?: () => void;
  readonly query: string;
  readonly onQueryChange: (next: string) => void;
  readonly isSearching: boolean;
  readonly matchCount: number;
}

function SessionsPanelHeader({
  activeTab,
  onTabChange,
  onNewSession,
  query,
  onQueryChange,
  isSearching,
  matchCount,
}: SessionsPanelHeaderProps) {
  const { t } = useTranslate();
  return (
    <>
      {onNewSession ? (
        <Button
          variant="outline"
          className="mb-3 h-10 w-full justify-start gap-2 rounded-[12px] px-3 text-sm font-semibold"
          onClick={onNewSession}
        >
          <SquarePen className="size-4" aria-hidden={true} />
          {t('shell.subsidebar.sessions.newSession')}
        </Button>
      ) : null}
      <div className="relative mb-2">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden={true}
        />
        <input
          // CR-UX: type="text" em vez de "search". Webkit/Chromium adicionam
          // um botão X nativo em `type="search"`; combinado com nosso custom
          // clear button gerava DOIS X visíveis. Custom clear é melhor: bate
          // com o tema (dark/light) e respeita a11y.
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('shell.subsidebar.sessions.searchPlaceholder')}
          aria-label={t('shell.subsidebar.sessions.searchAriaLabel')}
          className="h-8 w-full rounded-[10px] border border-foreground/10 bg-background/60 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        {isSearching ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label={t('shell.subsidebar.sessions.searchClear')}
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent/15 hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden={true} />
          </button>
        ) : null}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('shell.subsidebar.sessions.section')}
        </span>
        {isSearching ? (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t('shell.subsidebar.sessions.matchCount', { count: matchCount })}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5 border-b border-foreground/5 pb-1">
        <TabIconButton
          icon={Clock}
          label={t('shell.subsidebar.sessions.tab.recent')}
          active={activeTab === 'recent'}
          onClick={() => onTabChange('recent')}
        />
        <TabIconButton
          icon={Pin}
          label={t('shell.subsidebar.sessions.tab.pinned')}
          active={activeTab === 'pinned'}
          onClick={() => onTabChange('pinned')}
        />
        <TabIconButton
          icon={Star}
          label={t('shell.subsidebar.sessions.tab.starred')}
          active={activeTab === 'starred'}
          onClick={() => onTabChange('starred')}
        />
        <TabIconButton
          icon={Bell}
          label={t('shell.subsidebar.sessions.tab.unread')}
          active={activeTab === 'unread'}
          onClick={() => onTabChange('unread')}
        />
        <TabIconButton
          icon={Archive}
          label={t('shell.subsidebar.sessions.tab.archived')}
          active={activeTab === 'archived'}
          onClick={() => onTabChange('archived')}
        />
      </div>
    </>
  );
}

function TagsToggle({ tagsContent }: { readonly tagsContent: ReactNode }) {
  const { t } = useTranslate();
  const [tagsOpen, setTagsOpen] = useState(false);
  return (
    <div className="shrink-0 px-2">
      <button
        type="button"
        onClick={() => setTagsOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-accent/10"
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
        <div className="max-h-64 overflow-y-auto overscroll-contain pb-3 pr-1">{tagsContent}</div>
      ) : null}
    </div>
  );
}

interface SessionsListBodyProps {
  readonly loading: boolean;
  readonly totalCount: number;
  readonly filteredSessions: readonly SessionsPanelSessionItem[];
  readonly isSearching: boolean;
  readonly query: string;
  readonly onClearSearch: () => void;
  readonly onNewSession?: () => void;
  readonly onOpenSession: (id: string) => void;
  readonly onSessionContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    session: SessionsPanelSessionItem,
  ) => void;
}

function SessionsListBody({
  loading,
  totalCount,
  filteredSessions,
  isSearching,
  query,
  onClearSearch,
  onNewSession,
  onOpenSession,
  onSessionContextMenu,
}: SessionsListBodyProps) {
  const { t } = useTranslate();
  const showEmpty = !loading && totalCount === 0;
  const showNoMatches = !loading && totalCount > 0 && filteredSessions.length === 0;
  const showList = !loading && filteredSessions.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-foreground/5">
      <div className="shrink-0 px-4 pb-1 pt-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('shell.subsidebar.sessions.history')}
        </span>
      </div>

      <div className="mask-fade-bottom min-h-0 flex-1 overflow-y-auto pb-3">
        {loading ? <SessionListSkeleton /> : null}
        {showEmpty ? (
          // Sem onNewSession (sem workspace ativo), texto de empty muda para
          // pedir criação de workspace primeiro.
          onNewSession ? (
            <SessionsEmptyState
              titleKey="shell.subsidebar.sessions.empty.title"
              descriptionKey="shell.subsidebar.sessions.empty.description"
              actionLabelKey="shell.subsidebar.sessions.newSession"
              onAction={onNewSession}
            />
          ) : (
            <SessionsEmptyState
              titleKey="shell.subsidebar.sessions.empty.noWorkspaceTitle"
              descriptionKey="shell.subsidebar.sessions.empty.noWorkspaceDescription"
            />
          )
        ) : null}
        {showNoMatches ? <NoSearchResults query={query} onClear={onClearSearch} /> : null}
        {showList ? (
          <SessionGroups
            sessions={filteredSessions}
            onOpenSession={onOpenSession}
            searchQuery={isSearching ? query : undefined}
            {...(onSessionContextMenu ? { onContextMenu: onSessionContextMenu } : {})}
          />
        ) : null}
      </div>
    </div>
  );
}

interface SessionGroupsProps {
  readonly sessions: readonly SessionsPanelSessionItem[];
  readonly onOpenSession: (id: string) => void;
  readonly searchQuery?: string | undefined;
  readonly onContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    session: SessionsPanelSessionItem,
  ) => void;
}

function SessionGroups({
  sessions,
  onOpenSession,
  searchQuery,
  onContextMenu,
}: SessionGroupsProps) {
  const { t } = useTranslate();
  const groups = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  return (
    <div className="flex flex-col gap-2 px-2">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {group.labelKey ? t(group.labelKey) : group.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((session) => (
              <li key={session.id}>
                <SessionRow
                  session={session}
                  onOpen={onOpenSession}
                  {...(searchQuery ? { searchQuery } : {})}
                  {...(onContextMenu ? { onContextMenu } : {})}
                />
              </li>
            ))}
          </ul>
        </div>
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
