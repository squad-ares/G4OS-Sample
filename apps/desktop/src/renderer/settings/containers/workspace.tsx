import { WorkspaceCategory, type WorkspaceCategoryFormInput } from '@g4os/features/settings';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { trpc } from '../../ipc/trpc-client.ts';

export function WorkspaceCategoryContainer() {
  const { t } = useTranslate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'list'],
    queryFn: () => trpc.workspaces.list.query(),
    staleTime: 10_000,
  });

  const workspaces = workspacesQuery.data ?? [];

  if (selectedId === null && workspaces.length > 0 && workspaces[0]) {
    setSelectedId(workspaces[0].id);
  }

  const onSave = useCallback(
    async (input: WorkspaceCategoryFormInput) => {
      setIsSaving(true);
      try {
        await trpc.workspaces.update.mutate({
          id: input.id,
          patch: {
            name: input.name,
            defaults: {
              ...(input.workingDirectory ? { workingDirectory: input.workingDirectory } : {}),
              ...(input.projectsRootPath ? { projectsRootPath: input.projectsRootPath } : {}),
              ...(input.llmConnectionSlug ? { llmConnectionSlug: input.llmConnectionSlug } : {}),
              permissionMode: 'ask',
            },
          },
        });
        toast.success(t('settings.workspace.saved'));
        await workspacesQuery.refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(t('settings.workspace.saveFailed', { message: msg }));
      } finally {
        setIsSaving(false);
      }
    },
    [workspacesQuery, t],
  );

  return (
    <WorkspaceCategory
      workspaces={workspaces}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onSave={onSave}
      isSaving={isSaving}
    />
  );
}
