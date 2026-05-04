import { type IntegrityReportView, RepairCategory } from '@g4os/features/settings';
import { toast, useTranslate } from '@g4os/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';

const DEBUG_HUD_QUERY_KEY = ['preferences', 'debug-hud-enabled'] as const;

export function RepairCategoryContainer() {
  const { t } = useTranslate();
  const tanstackQueryClient = useQueryClient();
  const infoQuery = useQuery({
    queryKey: ['platform', 'app-info'],
    queryFn: () => trpc.platform.getAppInfo.query(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const debugHudQuery = useQuery({
    queryKey: DEBUG_HUD_QUERY_KEY,
    queryFn: () => trpc.preferences.getDebugHudEnabled.query(),
    staleTime: 60_000,
  });

  const debugHudMutation = useMutation({
    mutationFn: (enabled: boolean) => trpc.preferences.setDebugHudEnabled.mutate({ enabled }),
    onMutate: async (enabled) => {
      await tanstackQueryClient.cancelQueries({ queryKey: DEBUG_HUD_QUERY_KEY });
      const previous = tanstackQueryClient.getQueryData<boolean>(DEBUG_HUD_QUERY_KEY);
      tanstackQueryClient.setQueryData(DEBUG_HUD_QUERY_KEY, enabled);
      return { previous };
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        tanstackQueryClient.setQueryData(DEBUG_HUD_QUERY_KEY, context.previous);
      }
      toast.error(t('settings.repair.debugHud.toggle.error'));
    },
    onSuccess: (_, enabled) => {
      toast.success(
        enabled
          ? t('settings.repair.debugHud.toggle.enabled')
          : t('settings.repair.debugHud.toggle.disabled'),
      );
    },
  });

  const onReloadApp = useCallback(() => {
    globalThis.window.location.reload();
  }, []);

  const onClearQueryCache = useCallback(() => {
    queryClient.clear();
    toast.success(t('settings.repair.softReset.clearCacheDone'));
  }, [t]);

  const onDebugHudToggle = useCallback(
    (enabled: boolean) => {
      debugHudMutation.mutate(enabled);
    },
    [debugHudMutation],
  );

  // State local — sempre roda fresh, sem cache (queremos
  // sempre re-verificar o disco quando user clica).
  const [integrityReport, setIntegrityReport] = useState<IntegrityReportView | null>(null);
  const integrityMutation = useMutation({
    mutationFn: () => trpc.preferences.verifyRuntimeIntegrity.mutate(),
    onSuccess: (data) => {
      // Zod output retorna `string | undefined` em campos opcionais; o
      // view type usa optional-without-undefined. Cast via unknown
      // pois a estrutura é equivalente em runtime.
      setIntegrityReport(data as unknown as IntegrityReportView);
      if (data.ok) {
        toast.success(t('settings.repair.integrity.toastOk'));
      } else if (data.metaPresent) {
        toast.error(t('settings.repair.integrity.toastFailed'));
      } else {
        toast.warning(t('settings.repair.integrity.toastMetaMissing'));
      }
    },
    onError: () => {
      toast.error(t('settings.repair.integrity.toastError'));
    },
  });
  const onVerifyIntegrity = useCallback(() => {
    integrityMutation.mutate();
  }, [integrityMutation]);

  // Hard reset — apaga workspaces + credenciais via `auth.wipeAndReset`
  // (orquestrado em `apps/desktop/src/main/services/perform-wipe.ts`) e
  // relança o app sem state in-memory residual. Útil em dev quando o
  // login está corrompido / cache em estado ruim.
  const hardResetMutation = useMutation({
    mutationFn: () => trpc.auth.wipeAndReset.mutate({ confirm: true }),
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t('settings.repair.hardReset.failed', { message }));
    },
    // Sem `onSuccess` — main process chama `app.relaunch() + exit(0)`
    // antes que a mutação resolva no renderer.
  });
  const onHardReset = useCallback(() => {
    hardResetMutation.mutate();
  }, [hardResetMutation]);

  return (
    <RepairCategory
      appVersion={infoQuery.data?.version ?? ''}
      platform={infoQuery.data?.platform ?? ''}
      onReloadApp={onReloadApp}
      onClearQueryCache={onClearQueryCache}
      debugHudEnabled={debugHudQuery.data ?? false}
      onDebugHudToggle={onDebugHudToggle}
      debugHudPending={debugHudMutation.isPending}
      onVerifyIntegrity={onVerifyIntegrity}
      integrityReport={integrityReport}
      integrityPending={integrityMutation.isPending}
      onHardReset={onHardReset}
      hardResetPending={hardResetMutation.isPending}
    />
  );
}
