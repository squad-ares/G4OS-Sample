import { ApiKeysPanel, type ApiKeysPanelCredential } from '@g4os/features/settings';
import { ShellStatusPanel } from '@g4os/features/shell';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';

export function AgentsCategoryContainer() {
  const { t } = useTranslate();
  const credentialsQuery = useQuery({
    queryKey: ['credentials', 'list'],
    queryFn: () => trpc.credentials.list.query(),
    staleTime: 5_000,
  });

  const credentials: readonly ApiKeysPanelCredential[] =
    credentialsQuery.data?.map((c) => ({ key: c.key, configured: true })) ?? [];

  const handleSave = useCallback(
    async (key: string, value: string) => {
      try {
        await trpc.credentials.set.mutate({ key, value });
        toast.success(t('settings.apiKeys.actions.saved'));
        await credentialsQuery.refetch();
        await queryClient.invalidateQueries({ queryKey: ['sessions', 'runtime-status'] });
      } catch (err) {
        toast.error(String(err));
      }
    },
    [credentialsQuery, t],
  );

  const handleClear = useCallback(
    async (key: string) => {
      try {
        await trpc.credentials.delete.mutate({ key });
        toast.success(t('settings.apiKeys.actions.cleared'));
        await credentialsQuery.refetch();
        await queryClient.invalidateQueries({ queryKey: ['sessions', 'runtime-status'] });
      } catch (err) {
        toast.error(String(err));
      }
    },
    [credentialsQuery, t],
  );

  return (
    <ShellStatusPanel
      title={t('settings.apiKeys.title')}
      description={t('settings.apiKeys.description')}
      badge={t('settings.category.agents.label')}
    >
      <ApiKeysPanel
        credentials={credentials}
        onSave={handleSave}
        onClear={handleClear}
        disabled={credentialsQuery.isLoading}
      />
    </ShellStatusPanel>
  );
}
