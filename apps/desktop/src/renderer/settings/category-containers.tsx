/**
 * Containers das categorias de settings — conectam os componentes puros
 * em `@g4os/features/settings` aos hooks de IPC/tRPC do desktop renderer.
 * Movidos para fora da rota para manter `settings.$category.tsx` < 300 LOC.
 */

import {
  ApiKeysPanel,
  type ApiKeysPanelCredential,
  AppCategory,
  type AppInfoView,
  PermissionsCategory,
  PreferencesCategory,
  RepairCategory,
  TagsCategory,
  WorkspaceCategory,
  type WorkspaceCategoryFormInput,
} from '@g4os/features/settings';
import { ShellStatusPanel } from '@g4os/features/shell';
import { useActiveWorkspaceId } from '@g4os/features/workspaces';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';

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

const SEEN_NEWS_STORAGE_KEY = 'g4os.news.seenIds';
const PREFERENCES_STORAGE_PREFIX = 'g4os.';

function countSeenNews(): number {
  try {
    const raw = localStorage.getItem(SEEN_NEWS_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function PreferencesCategoryContainer() {
  const { t } = useTranslate();
  const [seenCount, setSeenCount] = useState(() => countSeenNews());

  const onResetSeenNews = useCallback(() => {
    localStorage.removeItem(SEEN_NEWS_STORAGE_KEY);
    setSeenCount(0);
    toast.success(t('settings.preferences.news.resetDone'));
    void queryClient.invalidateQueries({ queryKey: ['news'] });
  }, [t]);

  const onResetAll = useCallback(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFERENCES_STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
    setSeenCount(0);
    toast.success(t('settings.preferences.resetAll.done', { count: keys.length }));
    void queryClient.invalidateQueries({ queryKey: ['news'] });
  }, [t]);

  return (
    <PreferencesCategory
      seenNewsCount={seenCount}
      onResetSeenNews={onResetSeenNews}
      onResetAll={onResetAll}
    />
  );
}

export function PermissionsCategoryContainer() {
  const { t } = useTranslate();
  const workspaceId = useActiveWorkspaceId();

  const sessionsQuery = useQuery({
    queryKey: ['sessions', 'list', workspaceId ?? ''],
    queryFn: () => trpc.sessions.list.query({ workspaceId: workspaceId ?? '' }),
    staleTime: 5_000,
    enabled: Boolean(workspaceId),
  });

  const permissionsQuery = useQuery({
    queryKey: ['permissions', 'list', workspaceId ?? ''],
    queryFn: () => trpc.permissions.list.query({ workspaceId: workspaceId ?? '' }),
    staleTime: 5_000,
    enabled: Boolean(workspaceId),
  });

  const sessions = sessionsQuery.data ?? [];
  const toolDecisions = permissionsQuery.data ?? [];
  const stickyBySession = sessions
    .filter((s) => s.stickyMountedSourceSlugs.length > 0)
    .map((s) => ({
      sessionId: s.id,
      sessionName: s.name,
      sticky: s.stickyMountedSourceSlugs,
    }));
  const rejectedBySession = sessions
    .filter((s) => s.rejectedSourceSlugs.length > 0)
    .map((s) => ({
      sessionId: s.id,
      sessionName: s.name,
      rejected: s.rejectedSourceSlugs,
    }));

  const onClearSession = useCallback(
    async (sessionId: string) => {
      try {
        await trpc.sessions.update.mutate({
          id: sessionId,
          patch: { stickyMountedSourceSlugs: [], rejectedSourceSlugs: [] },
        });
        toast.success(t('settings.permissions.cleared'));
        await sessionsQuery.refetch();
      } catch (err) {
        toast.error(String(err));
      }
    },
    [sessionsQuery, t],
  );

  const onRevokeTool = useCallback(
    async (toolName: string, argsHash: string) => {
      if (!workspaceId) return;
      try {
        await trpc.permissions.revoke.mutate({ workspaceId, toolName, argsHash });
        toast.success(t('settings.permissions.revoked'));
        await permissionsQuery.refetch();
      } catch (err) {
        toast.error(String(err));
      }
    },
    [workspaceId, permissionsQuery, t],
  );

  return (
    <PermissionsCategory
      toolDecisions={toolDecisions}
      onRevokeTool={(toolName, argsHash) => void onRevokeTool(toolName, argsHash)}
      stickyBySession={stickyBySession}
      rejectedBySession={rejectedBySession}
      onClearSession={(id) => void onClearSession(id)}
    />
  );
}

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
