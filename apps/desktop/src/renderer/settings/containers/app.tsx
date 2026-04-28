import { AppCategory, type AppInfoView } from '@g4os/features/settings';
import { useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { trpc } from '../../ipc/trpc-client.ts';

export function AppCategoryContainer() {
  const { t } = useTranslate();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const infoQuery = useQuery({
    queryKey: ['platform', 'app-info'],
    queryFn: () => trpc.platform.getAppInfo.query(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const info: AppInfoView | null = infoQuery.data ?? null;

  const onCheckUpdates = useCallback(async () => {
    setChecking(true);
    setMessage(undefined);
    try {
      const result = await trpc.updates.check.query();
      setMessage(
        result.hasUpdate
          ? t('settings.app.updates.available', { version: result.version ?? '' })
          : t('settings.app.updates.upToDate'),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(t('settings.app.updates.failed', { message: msg }));
    } finally {
      setChecking(false);
    }
  }, [t]);

  return (
    <AppCategory
      info={info}
      onCheckUpdates={() => void onCheckUpdates()}
      updateState={{
        checking,
        ...(message === undefined ? {} : { message }),
      }}
    />
  );
}
