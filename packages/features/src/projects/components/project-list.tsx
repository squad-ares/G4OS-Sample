import type { ProjectCreateInput } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
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
}

export function ProjectList({
  workspaceId,
  projects,
  loading,
  onOpen,
  onCreate,
  onArchive,
  onDelete,
}: ProjectListProps) {
  const { t } = useTranslate();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(['sk-a', 'sk-b', 'sk-c'] as const).map((k) => (
          <div key={k} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('project.list.title')}</h2>
        {onCreate && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            {t('project.list.createNew')}
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <p className="text-sm">{t('project.list.empty')}</p>
          {onCreate && (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              {t('project.list.createFirst')}
            </Button>
          )}
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

      {onCreate && (
        <CreateProjectDialog
          workspaceId={workspaceId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={onCreate}
        />
      )}
    </div>
  );
}
