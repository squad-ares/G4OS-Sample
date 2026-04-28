import { RepairCategory } from '@g4os/features/settings';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';

export function RepairCategoryContainer() {
  const { t } = useTranslate();
  const infoQuery = useQuery({
    queryKey: ['platform', 'app-info'],
    queryFn: () => trpc.platform.getAppInfo.query(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const onReloadApp = useCallback(() => {
    globalThis.window.location.reload();
  }, []);

  const onClearQueryCache = useCallback(() => {
    queryClient.clear();
    toast.success(t('settings.repair.softReset.clearCacheDone'));
  }, [t]);

  return (
    <RepairCategory
      appVersion={infoQuery.data?.version ?? ''}
      platform={infoQuery.data?.platform ?? ''}
      onReloadApp={onReloadApp}
      onClearQueryCache={onClearQueryCache}
    />
  );
}
