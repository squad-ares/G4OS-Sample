import { TagsCategory } from '@g4os/features/settings';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { trpc } from '../../ipc/trpc-client.ts';

export function TagsCategoryContainer() {
  const { t } = useTranslate();
  const [isMutating, setIsMutating] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'list'],
    queryFn: () => trpc.workspaces.list.query(),
    staleTime: 10_000,
  });
  const workspaceId = workspacesQuery.data?.[0]?.id ?? null;

  const labelsQuery = useQuery({
    queryKey: ['labels', 'list', workspaceId],
    queryFn: () => {
      if (!workspaceId) return Promise.resolve([]);
      return trpc.labels.list.query({ workspaceId });
    },
    enabled: workspaceId !== null,
    staleTime: 5_000,
  });

  const refetch = useCallback(() => labelsQuery.refetch(), [labelsQuery]);
  const wrap = useCallback(
    async (operation: () => Promise<unknown>, successKey: 'created' | 'renamed' | 'deleted') => {
      setIsMutating(true);
      try {
        await operation();
        toast.success(t(`settings.tags.${successKey}`));
        await refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(t('settings.tags.failed', { message: msg }));
      } finally {
        setIsMutating(false);
      }
    },
    [refetch, t],
  );

  const onCreate = useCallback(
    async (input: { name: string; color: string | null }) => {
      if (!workspaceId) return;
      await wrap(
        () =>
          trpc.labels.create.mutate({
            workspaceId,
            name: input.name,
            ...(input.color ? { color: input.color } : {}),
          }),
        'created',
      );
    },
    [workspaceId, wrap],
  );

  const onRename = useCallback(
    (id: string, name: string) => wrap(() => trpc.labels.rename.mutate({ id, name }), 'renamed'),
    [wrap],
  );

  const onDelete = useCallback(
    (id: string) => wrap(() => trpc.labels.delete.mutate({ id }), 'deleted'),
    [wrap],
  );

  return (
    <TagsCategory
      labels={labelsQuery.data ?? []}
      onCreate={onCreate}
      onRename={onRename}
      onDelete={onDelete}
      isMutating={isMutating}
      workspaceMissing={workspaceId === null}
    />
  );
}
