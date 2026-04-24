import type { Project } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { FolderKanban, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { SubSidebarShell } from './sub-sidebar-shell.tsx';

export interface ProjectsPanelProps {
  readonly projects: readonly Project[];
  readonly activeProjectId?: string | undefined;
  readonly loading?: boolean;
  readonly onOpenProject: (id: string) => void;
  readonly onNewProject: () => void;
  readonly footer?: ReactNode;
}

export function ProjectsPanel({
  projects,
  activeProjectId,
  loading = false,
  onOpenProject,
  onNewProject,
  footer,
}: ProjectsPanelProps) {
  const { t } = useTranslate();

  const header = (
    <>
      <Button
        variant="outline"
        className="mb-3 h-10 w-full justify-start gap-2 rounded-[12px] px-3 text-sm font-semibold"
        onClick={onNewProject}
      >
        <Plus className="h-4 w-4" aria-hidden={true} />
        {t('shell.subsidebar.projects.newProject')}
      </Button>

      <div className="px-1 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('shell.subsidebar.projects.section')}
        </span>
      </div>
    </>
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <div className="mask-fade-bottom min-h-0 flex-1 overflow-y-auto pb-3">
        {loading ? (
          <div className="flex flex-col gap-1 px-2">
            {['sk-a', 'sk-b', 'sk-c'].map((key) => (
              <div key={key} className="h-10 animate-pulse rounded-[10px] bg-foreground/5" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {t('shell.subsidebar.projects.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  aria-current={activeProjectId === project.id ? 'true' : undefined}
                  className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left transition-colors ${
                    activeProjectId === project.id
                      ? 'bg-foreground/8 text-foreground'
                      : 'text-foreground/85 hover:bg-foreground/5'
                  }`}
                >
                  <span
                    aria-hidden={true}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: project.color ?? 'var(--foreground-10)',
                      color: 'var(--background)',
                    }}
                  >
                    <FolderKanban className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 truncate text-[13px] font-medium">{project.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SubSidebarShell>
  );
}
