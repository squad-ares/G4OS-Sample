import { ShellPlaceholderPage } from '@g4os/features/shell';
import { SourcesPage } from '@g4os/features/sources';
import { useActiveWorkspaceId } from '@g4os/features/workspaces';
import { toast, useTranslate } from '@g4os/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';

function ConnectionsPage() {
  const workspaceId = useActiveWorkspaceId();

  if (!workspaceId) return <ShellPlaceholderPage pageId="connections" />;

  return <ConnectionsBody workspaceId={workspaceId} />;
}

function ConnectionsBody({ workspaceId }: { readonly workspaceId: string }) {
  const { t } = useTranslate();

  const sourcesQuery = useQuery({
    queryKey: ['sources', 'list', workspaceId],
    queryFn: () => trpc.sources.list.query({ workspaceId }),
    staleTime: 10_000,
  });

  const catalogQuery = useQuery({
    queryKey: ['sources', 'catalog', workspaceId],
    queryFn: () => trpc.sources.listAvailable.query({ workspaceId }),
    staleTime: 10_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['sources', 'list', workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ['sources', 'catalog', workspaceId] });
  }, [workspaceId]);

  const enableMut = useMutation({
    mutationFn: (slug: string) => trpc.sources.enableManaged.mutate({ workspaceId, slug }),
    onSuccess: () => {
      toast.success(t('sources.catalog.installed'));
      invalidate();
    },
    onError: (error) => toast.error(String(error)),
  });

  const createStdioMut = useMutation({
    mutationFn: (input: Parameters<typeof trpc.sources.createStdio.mutate>[0]) =>
      trpc.sources.createStdio.mutate(input),
    onSuccess: () => {
      toast.success(t('sources.dialog.submit'));
      invalidate();
    },
    onError: (error) => toast.error(String(error)),
  });

  const toggleMut = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      trpc.sources.setEnabled.mutate({ workspaceId, id: vars.id, enabled: vars.enabled }),
    onSuccess: invalidate,
    onError: (error) => toast.error(String(error)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => trpc.sources.delete.mutate({ workspaceId, id }),
    onSuccess: invalidate,
    onError: (error) => toast.error(String(error)),
  });

  const [testingId, setTestingId] = useState<string | null>(null);
  const testMut = useMutation({
    mutationFn: (id: string) => trpc.sources.testConnection.mutate({ workspaceId, id }),
    onMutate: (id) => {
      setTestingId(id);
    },
    onSettled: () => {
      setTestingId(null);
    },
    onSuccess: (status) => {
      if (status === 'connected') toast.success(t('sources.test.success'));
      else if (status === 'needs_auth') toast.warning(t('sources.status.needs_auth'));
      else toast.error(t('sources.test.failed'));
      invalidate();
    },
    onError: (error) => toast.error(String(error)),
  });

  const mutating =
    enableMut.isPending || createStdioMut.isPending || toggleMut.isPending || deleteMut.isPending;

  return (
    <SourcesPage
      workspaceId={workspaceId}
      sources={sourcesQuery.data ?? []}
      catalog={catalogQuery.data ?? []}
      loading={sourcesQuery.isLoading || catalogQuery.isLoading}
      mutating={mutating}
      onEnableManaged={async (slug) => {
        await enableMut.mutateAsync(slug);
      }}
      onCreateStdio={async (input) => {
        await createStdioMut.mutateAsync(input);
      }}
      onToggle={async (id, enabled) => {
        await toggleMut.mutateAsync({ id, enabled });
      }}
      onDelete={async (id) => {
        await deleteMut.mutateAsync(id);
      }}
      onTest={async (id) => {
        await testMut.mutateAsync(id);
      }}
      {...(testingId ? { testingId } : {})}
    />
  );
}

export const Route = createFileRoute('/_app/connections')({
  component: ConnectionsPage,
});
