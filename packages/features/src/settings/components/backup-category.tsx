import { ConfirmDestructiveDialog, Spinner, StatusPanel, useTranslate } from '@g4os/ui';
import { Archive, FolderOpen, Play, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

export interface BackupEntryView {
  readonly path: string;
  readonly workspaceId: string;
  readonly timestamp: number;
  readonly sizeBytes: number;
}

export interface BackupWorkspaceOption {
  readonly id: string;
  readonly name: string;
}

export interface BackupCategoryProps {
  readonly entries: readonly BackupEntryView[];
  readonly workspaces: readonly BackupWorkspaceOption[];
  readonly isLoading?: boolean;
  readonly runningWorkspaceId?: string | null;
  /** Dispara backup manual de um workspace. */
  readonly onRunNow: (workspaceId: string) => void;
  /** Apaga um backup específico (path absoluto). */
  readonly onDelete: (path: string) => void;
  /** Revela um backup no Finder/Explorer via `platform.showItemInFolder`. */
  readonly onReveal: (path: string) => void;
}

/**
 * Settings > Backup. Lista backups em `<data>/auto-backups/` agrupados
 * por workspace (mais recente primeiro), permite disparar backup manual
 * e apagar entradas individuais. Restore não é exposto aqui — é destrutivo
 * e merece UX dedicada (ver follow-up em `v2-settings-followups.md`).
 */
export function BackupCategory({
  entries,
  workspaces,
  isLoading,
  runningWorkspaceId,
  onRunNow,
  onDelete,
  onReveal,
}: BackupCategoryProps): ReactNode {
  const { t } = useTranslate();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const grouped = groupByWorkspace(entries);
  const workspaceNameOf = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? t('settings.backup.unknownWorkspace');

  return (
    <div className="flex flex-col gap-4">
      <StatusPanel
        title={t('settings.backup.runNow.title')}
        description={t('settings.backup.runNow.description')}
        badge={t('settings.category.backup.label')}
      >
        {workspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('settings.backup.runNow.noWorkspaces')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {workspaces.map((w) => {
              const isRunning = runningWorkspaceId === w.id;
              return (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{w.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {(grouped.get(w.id)?.length ?? 0) === 0
                        ? t('settings.backup.runNow.noBackupsYet')
                        : t('settings.backup.runNow.lastBackup', {
                            when: formatRelative(grouped.get(w.id)?.[0]?.timestamp ?? 0),
                          })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRunNow(w.id)}
                    disabled={isRunning}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
                  >
                    {isRunning ? (
                      <>
                        <Spinner size="sm" />
                        {t('settings.backup.runNow.running')}
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5" aria-hidden={true} />
                        {t('settings.backup.runNow.action')}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </StatusPanel>

      <StatusPanel
        title={t('settings.backup.list.title')}
        description={t('settings.backup.list.description')}
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('settings.backup.list.loading')}</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-foreground/[0.05] text-muted-foreground">
              <Archive className="size-5" aria-hidden={true} />
            </div>
            <p className="text-sm text-muted-foreground">{t('settings.backup.list.empty')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.map((entry) => (
              <li
                key={entry.path}
                className="flex items-center justify-between gap-3 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {workspaceNameOf(entry.workspaceId)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatTimestamp(entry.timestamp)} · {formatBytes(entry.sizeBytes)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onReveal(entry.path)}
                    aria-label={t('settings.backup.list.reveal')}
                    title={t('settings.backup.list.reveal')}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/15 hover:text-foreground"
                  >
                    <FolderOpen className="size-3.5" aria-hidden={true} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(entry.path)}
                    aria-label={t('settings.backup.list.delete')}
                    title={t('settings.backup.list.delete')}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden={true} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </StatusPanel>

      <ConfirmDestructiveDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
        title={t('settings.backup.delete.confirmTitle')}
        description={t('settings.backup.delete.confirmDescription')}
        confirmLabel={t('settings.backup.delete.confirmAction')}
        cancelLabel={t('settings.backup.delete.confirmCancel')}
        onConfirm={() => {
          const path = pendingDelete;
          setPendingDelete(null);
          if (path) onDelete(path);
        }}
      />
    </div>
  );
}

function groupByWorkspace(
  entries: readonly BackupEntryView[],
): ReadonlyMap<string, readonly BackupEntryView[]> {
  const map = new Map<string, BackupEntryView[]>();
  for (const e of entries) {
    const list = map.get(e.workspaceId) ?? [];
    list.push(e);
    map.set(e.workspaceId, list);
  }
  for (const list of map.values()) list.sort((a, b) => b.timestamp - a.timestamp);
  return map;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

function formatRelative(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 0) return 'agora';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
