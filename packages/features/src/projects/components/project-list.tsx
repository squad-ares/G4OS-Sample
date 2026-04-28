import type { ProjectCreateInput } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { FolderKanban, FolderOpen, Plus, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.slug} ${project.description ?? ''}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [projects, query]);

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
        <div className="flex items-center gap-2">
          {onImportLegacy ? (
            <Button size="sm" variant="outline" onClick={onImportLegacy} className="gap-1.5">
              <FolderOpen className="h-4 w-4" aria-hidden={true} />
              {t('project.list.importLegacy')}
            </Button>
          ) : null}
          {onCreate ? (
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" aria-hidden={true} />
              {t('project.list.createNew')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden={true}
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('project.list.searchPlaceholder')}
          className="h-9 w-full rounded-md border border-foreground/10 bg-background pl-9 pr-3 text-sm outline-none transition focus:border-foreground/25"
        />
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
              <Button onClick={() => setDialogOpen(true)}>
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden={true} />
                {t('project.list.createFirst')}
              </Button>
            ) : null}
            {onImportLegacy ? (
              <Button variant="outline" onClick={onImportLegacy}>
                <FolderOpen className="mr-1.5 h-4 w-4" aria-hidden={true} />
                {t('project.list.importLegacy')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/10 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('project.list.emptySearch')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((p) => (
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
