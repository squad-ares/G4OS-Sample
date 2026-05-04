/**
 * Hook orquestrador do page `/workspaces/$id/sessions`: mantém filtros,
 * faz chamadas tRPC, cria/arquiva/restaura/apaga/pin/star + abre a
 * command palette global. Componente de página consome esse hook e fica
 * só com render + wiring.
 */

import {
  DEFAULT_SESSION_FILTERS,
  type SessionFilters,
  type SessionListItem,
} from '@g4os/features/sessions';
import type {
  GlobalSearchResult,
  SessionFilter as KernelSessionFilter,
  Session,
} from '@g4os/kernel/types';
import { toast, useTranslate } from '@g4os/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';
import {
  globalSearchQueryOptions,
  invalidateSessions,
  sessionsListQueryOptions,
} from './sessions-store.ts';

const DEFAULT_LIMIT = 100;

export interface SessionsPageState {
  readonly filters: SessionFilters;
  readonly setFilters: (next: SessionFilters) => void;
  readonly items: readonly SessionListItem[];
  readonly isLoading: boolean;
  readonly searchOpen: boolean;
  readonly searchQuery: string;
  readonly searchResults: GlobalSearchResult | null;
  readonly openSearch: () => void;
  readonly closeSearch: () => void;
  readonly setSearchQuery: (next: string) => void;
  readonly createSession: (name?: string) => Promise<Session | null>;
  readonly archive: (id: string) => Promise<void>;
  readonly restore: (id: string) => Promise<void>;
  readonly softDelete: (id: string) => Promise<void>;
  readonly pin: (id: string, pinned: boolean) => Promise<void>;
  readonly star: (id: string, starred: boolean) => Promise<void>;
  readonly markRead: (id: string, unread: boolean) => Promise<void>;
}

export function useSessionsPage(workspaceId: string): SessionsPageState {
  const { t } = useTranslate();
  const [filters, setFilters] = useState<SessionFilters>(DEFAULT_SESSION_FILTERS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const kernelFilter = useMemo<KernelSessionFilter>(
    () => ({
      workspaceId,
      lifecycle: filters.lifecycle,
      labelIds: filters.labelIds.length > 0 ? [...filters.labelIds] : undefined,
      pinned: filters.pinned,
      starred: filters.starred,
      unread: filters.unread,
      text: filters.text,
      includeBranches: false,
      limit: DEFAULT_LIMIT,
      offset: 0,
    }),
    [workspaceId, filters],
  );

  const listQuery = useQuery(sessionsListQueryOptions(kernelFilter));
  const searchDataQuery = useQuery(globalSearchQueryOptions(workspaceId, searchQuery));

  const items = useMemo<readonly SessionListItem[]>(
    () => (listQuery.data?.items ?? []).map(toListItem),
    [listQuery.data],
  );

  const invalidate = useCallback(() => invalidateSessions(queryClient), []);

  const createMutation = useMutation({
    mutationFn: async (name: string) => trpc.sessions.create.mutate({ workspaceId, name }),
    onSuccess: () => invalidate(),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => trpc.sessions.archive.mutate({ id }),
    onSuccess: () => invalidate(),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => trpc.sessions.restore.mutate({ id }),
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => trpc.sessions.delete.mutate({ id, confirm: true }),
    onSuccess: () => invalidate(),
  });

  const pinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { readonly id: string; readonly pinned: boolean }) =>
      trpc.sessions.pin.mutate({ id, pinned }),
    onSuccess: () => invalidate(),
  });

  const starMutation = useMutation({
    mutationFn: async ({ id, starred }: { readonly id: string; readonly starred: boolean }) =>
      trpc.sessions.star.mutate({ id, starred }),
    onSuccess: () => invalidate(),
  });

  const readMutation = useMutation({
    mutationFn: async ({ id, unread }: { readonly id: string; readonly unread: boolean }) =>
      trpc.sessions.markRead.mutate({ id, unread }),
    onSuccess: () => invalidate(),
  });

  return {
    filters,
    setFilters,
    items,
    isLoading: listQuery.isLoading,
    searchOpen,
    searchQuery,
    searchResults: searchDataQuery.data ?? null,
    openSearch: () => setSearchOpen(true),
    closeSearch: () => setSearchOpen(false),
    setSearchQuery,
    createSession: async (name) => {
      try {
        // CR-25 F-CR25-2: fallback i18n. Antes era hardcoded `'Nova sessão'`,
        // quebrando paridade com en-US (sessões apareciam com nome pt-BR pra
        // usuário inglês) e violando "Padrões obrigatórios → labelKey via t()"
        // do CLAUDE.md.
        const session = await createMutation.mutateAsync(name ?? t('session.new.defaultName'));
        return session as Session;
      } catch (error) {
        toast.error(String(error));
        return null;
      }
    },
    archive: async (id) => void (await archiveMutation.mutateAsync(id)),
    restore: async (id) => void (await restoreMutation.mutateAsync(id)),
    softDelete: async (id) => void (await deleteMutation.mutateAsync(id)),
    pin: async (id, pinned) => void (await pinMutation.mutateAsync({ id, pinned })),
    star: async (id, starred) => void (await starMutation.mutateAsync({ id, starred })),
    markRead: async (id, unread) => void (await readMutation.mutateAsync({ id, unread })),
  };
}

function toListItem(session: Session): SessionListItem {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    name: session.name,
    lifecycle: session.lifecycle,
    messageCount: session.messageCount,
    ...(session.lastMessageAt === undefined ? {} : { lastMessageAt: session.lastMessageAt }),
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    ...(session.pinnedAt === undefined ? {} : { pinnedAt: session.pinnedAt }),
    ...(session.starredAt === undefined ? {} : { starredAt: session.starredAt }),
    unread: session.unread,
    labels: session.labels,
    ...(session.parentId === undefined ? {} : { parentId: session.parentId }),
  };
}
