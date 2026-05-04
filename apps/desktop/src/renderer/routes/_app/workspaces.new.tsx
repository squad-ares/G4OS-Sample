import { useSetActiveWorkspaceId, WorkspaceSetupWizard } from '@g4os/features/workspaces';
import { useTranslate } from '@g4os/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useState } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import { invalidateWorkspaces } from '../../workspaces/workspaces-store.ts';

export const Route = createFileRoute('/_app/workspaces/new')({
  component: NewWorkspaceRoute,
});

function NewWorkspaceRoute() {
  const navigate = useNavigate();
  const { t } = useTranslate();
  const setActiveWorkspaceId = useSetActiveWorkspaceId();
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    void navigate({ to: '/workspaces' });
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
          disabled={submitting}
          aria-label={t('workspace.wizard.close')}
          className="titlebar-no-drag mt-2 flex size-8 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent/12 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="size-4" aria-hidden={true} />
        </button>
      </header>
      <main className="relative flex flex-1 items-center justify-center p-8">
        <WorkspaceSetupWizard
          submitting={submitting}
          onCancel={close}
          onSubmit={async (draft) => {
            setSubmitting(true);
            try {
              const workspace = await trpc.workspaces.create.mutate({
                name: draft.name.trim(),
                rootPath: draft.workingDirectory.trim(),
              });

              const selectedColor = draft.color;
              await trpc.workspaces.update.mutate({
                id: workspace.id,
                patch: {
                  defaults: {
                    permissionMode: resolvePermissionMode(draft.defaults.permissionPreset),
                    ...(draft.workingDirectory.trim()
                      ? { workingDirectory: draft.workingDirectory.trim() }
                      : {}),
                  },
                  metadata: {
                    theme: selectedColor,
                  },
                  setupCompleted: true,
                  styleSetupCompleted: !draft.styleInterview.skip,
                },
              });
              await invalidateWorkspaces(queryClient);
              return { workspaceId: workspace.id };
            } finally {
              setSubmitting(false);
            }
          }}
          onComplete={({ workspaceId }) => {
            setActiveWorkspaceId(workspaceId);
            void navigate({
              to: '/workspaces/$workspaceId',
              params: { workspaceId },
            });
          }}
        />
      </main>
    </div>
  );
}

function resolvePermissionMode(
  preset: 'permissive' | 'balanced' | 'strict',
): 'allow-all' | 'ask' | 'safe' {
  if (preset === 'permissive') return 'allow-all';
  if (preset === 'strict') return 'safe';
  return 'ask';
}
