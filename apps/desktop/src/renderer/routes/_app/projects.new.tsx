import { CreateProjectForm } from '@g4os/features/projects';
import { useActiveWorkspaceId } from '@g4os/features/workspaces';
import { Button, useTranslate } from '@g4os/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Sparkles, X } from 'lucide-react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import { invalidateProjects } from '../../projects/projects-store.ts';
import { workspacesListQueryOptions } from '../../workspaces/workspaces-store.ts';

export const Route = createFileRoute('/_app/projects/new')({
  component: NewProjectRoute,
});

function NewProjectRoute() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();

  const { data: workspaces = [] } = useQuery(workspacesListQueryOptions());
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const workspaceId = activeWorkspace?.id ?? '';

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof trpc.projects.create.mutate>[0]) =>
      trpc.projects.create.mutate(input),
    onSuccess: async (project) => {
      await invalidateProjects(queryClient);
      void navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    },
  });

  const close = () => {
    if (createMutation.isPending) return;
    void navigate({ to: '/projects' });
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div
        aria-hidden={true}
        className="brand-dotted-bg pointer-events-none absolute inset-0 opacity-90"
      />
      <header className="titlebar-drag-region relative flex h-[50px] shrink-0 items-center justify-end px-6">
        <button
          type="button"
          onClick={close}
          disabled={createMutation.isPending}
          aria-label={t('project.new.close')}
          className="titlebar-no-drag mt-2 flex size-8 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent/12 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="size-4" aria-hidden={true} />
        </button>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl rounded-3xl border border-foreground/10 bg-background/85 p-6 shadow-[0_24px_80px_rgba(0,31,53,0.10)] backdrop-blur-xl sm:p-8">
          <header className="mb-6 space-y-2">
            <div className="flex items-center gap-3">
              <span
                aria-hidden={true}
                className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent"
              >
                <Sparkles className="size-5" />
              </span>
              <h1 className="text-2xl font-semibold tracking-[-0.03em]">
                {t('project.new.title')}
              </h1>
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              {t('project.new.description')}
            </p>
          </header>

          {workspaceId ? (
            <CreateProjectForm
              workspaceId={workspaceId}
              onSubmit={async (input) => {
                await createMutation.mutateAsync(input);
              }}
              onCancel={close}
              submitLabel={t('project.new.submit')}
            />
          ) : (
            <div className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>{t('project.list.selectWorkspace')}</p>
              <div>
                <Button variant="outline" onClick={close}>
                  {t('project.new.close')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
