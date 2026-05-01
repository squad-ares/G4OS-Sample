import { SupportCategory } from '@g4os/features/settings';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { trpc } from '../../ipc/trpc-client.ts';

/**
 * Wiring real do `SupportCategory`: lê `platform.getAppInfo` pra montar o
 * fingerprint, copia via `platform.copyToClipboard`, abre links externos
 * via `platform.openExternal`. Sem persistência — categoria é hub
 * estático de informação + ações.
 */
export function SupportCategoryContainer() {
  const { t } = useTranslate();

  const appInfoQuery = useQuery({
    queryKey: ['platform', 'app-info'],
    queryFn: () => trpc.platform.getAppInfo.query(),
    staleTime: 60_000,
  });

  const handleCopyFingerprint = useCallback(async () => {
    const info = appInfoQuery.data;
    if (!info) return;
    const text = [
      `version: ${info.version}`,
      `channel: ${info.isPackaged ? 'stable' : 'dev'}`,
      `platform: ${info.platform}`,
      `electron: ${info.electronVersion || '—'}`,
      `node: ${info.nodeVersion || '—'}`,
    ].join('\n');
    try {
      await trpc.platform.copyToClipboard.mutate({ text });
      toast.success(t('settings.support.fingerprint.copied'));
    } catch (err) {
      toast.error(String(err));
    }
  }, [appInfoQuery.data, t]);

  const handleOpenExternal = useCallback(
    (url: string) => {
      void trpc.platform.openExternal.mutate({ url }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(t('settings.support.openExternalFailed', { message: msg }));
      });
    },
    [t],
  );

  return (
    <SupportCategory
      info={appInfoQuery.data ?? null}
      onCopyFingerprint={() => void handleCopyFingerprint()}
      onOpenExternal={handleOpenExternal}
    />
  );
}
