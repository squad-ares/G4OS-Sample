import { LegacyProjectsReview, ProjectList } from '@g4os/features/projects';
import { useActiveWorkspaceId } from '@g4os/features/workspaces';
import { useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useProjectsPage } from '../../projects/use-projects-page.ts';
import { workspacesListQueryOptions } from '../../workspaces/workspaces-store.ts';

function ProjectsIndexPage() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();

  const { data: workspaces = [] } = useQuery(workspacesListQueryOptions());
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const workspaceId = activeWorkspace?.id ?? '';
  const workingDirectory = activeWorkspace?.defaults?.workingDirectory ?? '';

  const page = useProjectsPage(workspaceId, workingDirectory);

  if (!workspaceId) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{t('project.list.selectWorkspace')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto px-4 py-4">
      {page.legacyCheck.needsReview && (
        <div className="rounded-md border p-4">
          <LegacyProjectsReview
            projects={page.legacyCheck.projects}
            onApply={page.legacyCheck.apply}
            onCancel={page.legacyCheck.cancel}
            isApplying={page.legacyCheck.isApplying}
          />
        </div>
      )}

      <ProjectList
        workspaceId={workspaceId}
        projects={page.projects}
        loading={page.isLoading}
        onOpen={(id) => void navigate({ to: '/projects/$projectId', params: { projectId: id } })}
        onCreate={page.create}
        onArchive={page.archive}
        onDelete={page.softDelete}
      />
    </div>
  );
}

export const Route = createFileRoute('/_app/projects')({
  component: ProjectsIndexPage,
});
