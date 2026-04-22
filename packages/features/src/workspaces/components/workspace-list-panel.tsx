import type { Workspace } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { ExternalLink, Plus, Share, Trash2, Upload } from 'lucide-react';

export interface WorkspaceListPanelProps {
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string | null;
  readonly isLoading?: boolean;
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
  onOpen,
  onOpenInNewWindow,
  onCreate,
  onDelete,
  onExport,
  onImport,
}: WorkspaceListPanelProps) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col gap-4">
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
  readonly onOpen: (id: Workspace['id']) => void;
  readonly onOpenInNewWindow?: (id: Workspace['id']) => void;
  readonly onExport?: (id: Workspace['id']) => void;
  readonly onDelete?: (id: Workspace['id']) => void;
}

function WorkspaceListItem({
  workspace,
  isActive,
  onOpen,
  onOpenInNewWindow,
  onExport,
  onDelete,
}: WorkspaceListItemProps) {
  const { t } = useTranslate();
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
        <span className="flex flex-col">
          <span className="text-sm font-medium">{workspace.name}</span>
          <span className="text-xs text-muted-foreground">
            {workspace.slug} · {formatPath(workspace.rootPath)}
          </span>
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
