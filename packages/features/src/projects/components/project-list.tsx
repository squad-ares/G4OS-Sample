import type { ProjectCreateInput } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { FolderKanban, FolderOpen, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { ProjectListItem } from '../types.ts';
import { CreateProjectDialog } from './create-project-dialog.tsx';
import { ProjectCard } from './project-card.tsx';

export interface ProjectListProps {
  readonly workspaceId: string;
  readonly projects: readonly ProjectListItem[];
  readonly loading?: boolean;
  readonly onOpen?: (id: string) => void;
  readonly onCreate?: (input: ProjectCreateInput) => Promise<void>;
  readonly onArchive?: (id: string) => void;
  readonly onDelete?: (id: string) => void;
  readonly onImportLegacy?: () => void;
}

export function ProjectList({
  workspaceId,
  projects,
  loading,
  onOpen,
  onCreate,
  onArchive,
  onDelete,
  onImportLegacy,
}: ProjectListProps) {
  const { t } = useTranslate();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(['sk-a', 'sk-b', 'sk-c'] as const).map((k) => (
          <div key={k} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('project.list.title')}</h2>
        {onCreate ? (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            {t('project.list.createNew')}
          </Button>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.02] py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.05] text-foreground">
            <FolderKanban className="h-7 w-7" aria-hidden={true} />
          </div>
          <div className="max-w-sm space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              {t('project.list.emptyTitle')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('project.list.emptyDescription')}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onCreate ? (
              <Button onClick={() => setDialogOpen(true)} className="rounded-full">
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden={true} />
                {t('project.list.createFirst')}
              </Button>
            ) : null}
            {onImportLegacy ? (
              <Button variant="outline" onClick={onImportLegacy} className="rounded-full">
                <FolderOpen className="mr-1.5 h-4 w-4" aria-hidden={true} />
                {t('project.list.importLegacy')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              {...(onOpen ? { onOpen } : {})}
              {...(onArchive ? { onArchive } : {})}
              {...(onDelete ? { onDelete } : {})}
            />
          ))}
        </div>
      )}

      {onCreate ? (
        <CreateProjectDialog
          workspaceId={workspaceId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={onCreate}
        />
      ) : null}
    </div>
  );
}
