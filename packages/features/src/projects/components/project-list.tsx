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
  /**
   * Submit handler do form de criação. Quando provido SEM `onNavigateToCreate`,
   * o list ainda mostra o modal legado pra criar. Quando `onNavigateToCreate`
   * está provido, este callback fica disponível para a página
   * `/projects/new` chamar — o modal não é mais montado.
   */
  readonly onCreate?: (input: ProjectCreateInput) => Promise<void>;
  /**
   * Caminho canônico (ADR-0150 + ADR-0157): clicar "Novo" navega para uma
   * page dedicada com fullscreen overlay em vez de abrir modal. Quando
   * provido, o modal legacy não é montado. Caller decide a rota
   * (tipicamente `/projects/new` ou `/workspaces/$id/projects/new`).
   */
  readonly onNavigateToCreate?: () => void;
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
  onNavigateToCreate,
  onArchive,
  onDelete,
  onImportLegacy,
}: ProjectListProps) {
  const { t } = useTranslate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');

  // V1 paridade: page > modal pra criação (ADR-0150). Quando o caller
  // provê navegação dedicada, o button apenas navega; senão cai no
  // modal legacy.
  const handleCreateClick = onNavigateToCreate ?? (() => setDialogOpen(true));
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

  // V1 paridade (apps/electron/CLAUDE.md): Importar+Novo como row 2-col
  // full-width quando ambas existem, ou single-col quando só uma. Search
  // fica em row separada. Garante que ações primárias têm igual peso visual.
  const showImport = Boolean(onImportLegacy);
  const showCreate = Boolean(onCreate);
  const headerCols = showImport && showCreate ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('project.list.title')}</h2>
        {showImport || showCreate ? (
          <div className={`grid gap-2 ${headerCols}`}>
            {onImportLegacy ? (
              <Button
                variant="outline"
                onClick={onImportLegacy}
                className="w-full justify-center gap-1.5"
              >
                <FolderOpen className="h-4 w-4" aria-hidden={true} />
                {t('project.list.importLegacy')}
              </Button>
            ) : null}
            {onCreate ? (
              <Button onClick={handleCreateClick} className="w-full justify-center gap-1.5">
                <Plus className="h-4 w-4" aria-hidden={true} />
                {t('project.list.createNew')}
              </Button>
            ) : null}
          </div>
        ) : null}
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
              <Button onClick={handleCreateClick}>
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
              searchQuery={query}
              {...(onOpen ? { onOpen } : {})}
              {...(onArchive ? { onArchive } : {})}
              {...(onDelete ? { onDelete } : {})}
            />
          ))}
        </div>
      )}

      {onCreate && !onNavigateToCreate ? (
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
