import type { Workspace } from '@g4os/kernel/types';
import type { TranslationKey, TranslationParams } from '@g4os/translate';
import { Button, useTranslate } from '@g4os/ui';
import { ExternalLink, MessagesSquare, Plus, Share, Trash2, Upload } from 'lucide-react';
import { formatRelativeMs } from '../../shared/format-relative.ts';

type TranslateFn = (key: TranslationKey, params?: TranslationParams) => string;

export interface WorkspaceListItemStats {
  readonly sessionCount?: number;
  readonly projectCount?: number;
  readonly lastActivityAt?: number;
}

export interface WorkspaceListPanelProps {
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string | null;
  readonly isLoading?: boolean;
  readonly stats?: ReadonlyMap<string, WorkspaceListItemStats>;
  readonly onOpen: (id: Workspace['id']) => void;
  readonly onOpenInNewWindow?: (id: Workspace['id']) => void;
  readonly onCreate: () => void;
  readonly onDelete?: (id: Workspace['id']) => void;
  readonly onExport?: (id: Workspace['id']) => void;
  readonly onImport?: () => void;
}

export function WorkspaceListPanel({
  workspaces,
  activeWorkspaceId,
  isLoading = false,
  stats,
  onOpen,
  onOpenInNewWindow,
  onCreate,
  onDelete,
  onExport,
  onImport,
}: WorkspaceListPanelProps) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t('workspace.list.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('workspace.list.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {onImport ? (
            <Button variant="ghost" size="sm" onClick={onImport} className="gap-2">
              <Upload className="size-4" aria-hidden={true} />
              {t('workspace.list.import')}
            </Button>
          ) : null}
          <Button size="sm" onClick={onCreate} className="gap-2">
            <Plus className="size-4" aria-hidden={true} />
            {t('workspace.list.create')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-dashed border-foreground/12 px-4 py-8 text-center text-sm text-muted-foreground">
          {t('workspace.list.loading')}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-foreground/12 px-4 py-10 text-center">
          <h3 className="text-sm font-semibold">{t('workspace.list.emptyTitle')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('workspace.list.emptyDescription')}
          </p>
          <Button size="sm" onClick={onCreate} className="mt-4 gap-2">
            <Plus className="size-4" aria-hidden={true} />
            {t('workspace.list.emptyAction')}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-2" aria-label={t('workspace.list.ariaLabel')}>
          {workspaces.map((workspace) => (
            <WorkspaceListItem
              key={workspace.id}
              workspace={workspace}
              isActive={workspace.id === activeWorkspaceId}
              stats={stats?.get(workspace.id)}
              onOpen={onOpen}
              {...(onOpenInNewWindow === undefined ? {} : { onOpenInNewWindow })}
              {...(onExport === undefined ? {} : { onExport })}
              {...(onDelete === undefined ? {} : { onDelete })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface WorkspaceListItemProps {
  readonly workspace: Workspace;
  readonly isActive: boolean;
  readonly stats?: WorkspaceListItemStats | undefined;
  readonly onOpen: (id: Workspace['id']) => void;
  readonly onOpenInNewWindow?: (id: Workspace['id']) => void;
  readonly onExport?: (id: Workspace['id']) => void;
  readonly onDelete?: (id: Workspace['id']) => void;
}

function WorkspaceListItem({
  workspace,
  isActive,
  stats,
  onOpen,
  onOpenInNewWindow,
  onExport,
  onDelete,
}: WorkspaceListItemProps) {
  const { t } = useTranslate();
  const statsLine = formatStatsLine(stats, t);

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
        isActive
          ? 'border-accent/60 bg-accent/5'
          : 'border-foreground/10 hover:border-foreground/30'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(workspace.id)}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <span
          aria-hidden={true}
          className="flex size-9 items-center justify-center rounded-xl text-xs font-semibold text-background"
          style={{ backgroundColor: workspace.metadata.theme ?? 'var(--foreground)' }}
        >
          {workspace.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{workspace.name}</span>
            {isActive ? (
              <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                {t('workspace.list.activeBadge')}
              </span>
            ) : null}
          </span>
          <span className="truncate text-xs text-muted-foreground" title={workspace.rootPath}>
            {workspace.slug} · {formatPath(workspace.rootPath)}
          </span>
          {statsLine ? (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/85">
              <MessagesSquare className="size-3" aria-hidden={true} />
              <span>{statsLine}</span>
            </span>
          ) : null}
        </span>
      </button>
      <div className="flex items-center gap-1">
        {onOpenInNewWindow ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenInNewWindow(workspace.id)}
            aria-label={t('workspace.list.openInNewWindow')}
            title={t('workspace.list.openInNewWindow')}
          >
            <ExternalLink className="size-4" aria-hidden={true} />
          </Button>
        ) : null}
        {onExport ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onExport(workspace.id)}
            aria-label={t('workspace.list.export')}
            title={t('workspace.list.export')}
          >
            <Share className="size-4" aria-hidden={true} />
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(workspace.id)}
            aria-label={t('workspace.list.delete')}
            title={t('workspace.list.delete')}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden={true} />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function formatPath(path: string): string {
  const maxLen = 48;
  if (path.length <= maxLen) return path;
  return `…${path.slice(path.length - maxLen + 1)}`;
}

function formatStatsLine(stats: WorkspaceListItemStats | undefined, t: TranslateFn): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  if (typeof stats.sessionCount === 'number') {
    parts.push(t('workspace.list.stats.sessions', { count: stats.sessionCount }));
  }
  if (typeof stats.projectCount === 'number') {
    parts.push(t('workspace.list.stats.projects', { count: stats.projectCount }));
  }
  if (typeof stats.lastActivityAt === 'number' && stats.lastActivityAt > 0) {
    // CR-37 F-CR37-4/5: usar helper centralizado com locale do app.
    const when = formatRelativeMs(t, stats.lastActivityAt);
    if (when) parts.push(t('workspace.list.stats.lastActivity', { when }));
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
// CR-37 F-CR37-4: formatRelative local removida — usar formatRelativeMs do helper centralizado.
