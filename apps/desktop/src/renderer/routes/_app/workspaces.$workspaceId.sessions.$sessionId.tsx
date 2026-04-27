import {
  type Message as ChatMessage,
  Composer,
  type ComposerSendPayload,
  ConfirmDestructiveDialog,
  findModel,
  type MessageCardCallbacks,
  type ModelProvider,
  ModelSelector,
  modelProviderToSession,
  PermissionProvider,
  requestPermission,
  SessionActiveBadges,
  SessionBanners,
  SessionHeader,
  SessionMetadataPanel,
  SourcePicker,
  type ThinkingLevel,
  ThinkingLevelSelector,
  TranscriptView,
  useSessionShortcuts,
  useStreamingText,
  WorkingDirPicker,
} from '@g4os/features/chat';
import type { SessionEvent, TurnStreamEvent } from '@g4os/kernel/types';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatSendError, mapPermissionDecision } from '../../chat/session-page-helpers.ts';
import { useComposerAffordances } from '../../chat/use-composer-affordances.ts';
import { useSessionHeader } from '../../chat/use-session-header.ts';
import { useSessionMetadata } from '../../chat/use-session-metadata.ts';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import { kernelMessageToChat } from '../../messages/kernel-to-chat-mapper.ts';
import { invalidateMessages, messagesListQueryOptions } from '../../messages/messages-store.ts';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: (reason: route component agrega múltiplos hooks de efeito, query e callbacks de turn/permission/streaming que naturalmente compõem a página de chat. Lógica orquestral está distribuída entre useSessionHeader, useComposerAffordances e session-page-helpers; o que sobra é wiring direto que perde clareza se forçado a sub-hooks adicionais)
function SessionPage() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const { sessionId, workspaceId } = Route.useParams();

  const messagesQuery = useQuery(messagesListQueryOptions(sessionId));
  const [isStreaming, setIsStreaming] = useState(false);
  const {
    text: streamingText,
    append: appendStreamingText,
    flush: flushStreamingText,
    reset: resetStreamingText,
  } = useStreamingText();
  const [streamingTurnId, setStreamingTurnId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTruncateAt, setPendingTruncateAt] = useState<number | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId is the intentional reset trigger
  useEffect(() => {
    resetStreamingText();
    setStreamingTurnId(null);
    setIsStreaming(false);
  }, [sessionId, resetStreamingText]);

  const persistedMessages = useMemo(
    () => (messagesQuery.data ?? []).map(kernelMessageToChat),
    [messagesQuery.data],
  );

  const chatMessages = useMemo<ReadonlyArray<ChatMessage>>(() => {
    if (!streamingTurnId || !streamingText) return persistedMessages;
    const ghost: ChatMessage = {
      id: `__streaming__${streamingTurnId}`,
      role: 'assistant',
      content: [{ type: 'text', text: streamingText }],
      createdAt: Date.now(),
      isStreaming: true,
    };
    return [...persistedMessages, ghost];
  }, [persistedMessages, streamingTurnId, streamingText]);

  const handlePermissionRequired = useCallback(
    async (event: {
      readonly requestId: string;
      readonly toolUseId: string;
      readonly toolName: string;
      readonly inputJson: string;
    }): Promise<void> => {
      let parsedInput: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(event.inputJson) as unknown;
        if (parsed !== null && typeof parsed === 'object') {
          parsedInput = parsed as Record<string, unknown>;
        }
      } catch {
        parsedInput = { raw: event.inputJson };
      }
      const decision = await requestPermission({
        id: event.toolUseId,
        toolName: event.toolName,
        input: parsedInput,
      });
      const wireDecision = mapPermissionDecision(decision);
      try {
        await trpc.sessions.respondPermission.mutate({
          requestId: event.requestId,
          decision: wireDecision,
        });
      } catch (err) {
        toast.error(String(err));
      }
    },
    [],
  );

  // Persisted session events (message.added, tool.invoked, etc.)
  useEffect(() => {
    const sub = trpc.sessions.stream.subscribe(
      { sessionId },
      {
        onData: (event: SessionEvent) => {
          if (event.type === 'message.added' || event.type === 'tool.completed') {
            void invalidateMessages(queryClient, sessionId);
            setIsStreaming(false);
            // Reset do ghost assim que uma assistant message é persistida —
            // o texto agora vive no histórico; ghost deve limpar para não
            // duplicar o conteúdo entre iterações do tool loop.
            if (event.type === 'message.added' && event.message.role === 'assistant') {
              resetStreamingText();
            }
          }
          if (event.type === 'message.updated') {
            void invalidateMessages(queryClient, sessionId);
          }
          if (event.type === 'tool.invoked') {
            setIsStreaming(true);
          }
        },
        onError: (err: unknown) => {
          toast.error(String(err));
        },
      },
    );
    return () => sub.unsubscribe();
  }, [sessionId, resetStreamingText]);

  const handleTurnEvent = useCallback(
    (event: TurnStreamEvent): void => {
      switch (event.type) {
        case 'turn.started':
          setStreamingTurnId(event.turnId);
          resetStreamingText();
          setIsStreaming(true);
          return;
        case 'turn.text_chunk':
          appendStreamingText(event.text);
          return;
        case 'turn.done':
          flushStreamingText();
          setStreamingTurnId(null);
          return;
        case 'turn.error':
          flushStreamingText();
          setStreamingTurnId(null);
          setIsStreaming(false);
          toast.error(event.message);
          return;
        case 'turn.permission_required':
          void handlePermissionRequired(event);
          return;
      }
    },
    [appendStreamingText, flushStreamingText, resetStreamingText, handlePermissionRequired],
  );

  // Transient turn events for real-time streaming text
  useEffect(() => {
    const sub = trpc.sessions.turnStream.subscribe(
      { sessionId },
      {
        onData: handleTurnEvent,
        onError: (err: unknown) => {
          toast.error(String(err));
        },
      },
    );
    return () => sub.unsubscribe();
  }, [sessionId, handleTurnEvent]);

  const runtimeStatusQuery = useQuery({
    queryKey: ['sessions', 'runtime-status'],
    queryFn: () => trpc.sessions.runtimeStatus.query(),
    staleTime: 5_000,
  });
  const agentAvailable = runtimeStatusQuery.data?.available === true;

  const sessionQuery = useQuery({
    queryKey: ['sessions', 'get', sessionId],
    queryFn: () => trpc.sessions.get.query({ id: sessionId }),
    staleTime: 2_000,
  });

  const credentialsQuery = useQuery({
    queryKey: ['credentials', 'list'],
    queryFn: () => trpc.credentials.list.query(),
    staleTime: 10_000,
  });

  const availableProviders = useMemo<readonly ModelProvider[]>(() => {
    const keys = new Set((credentialsQuery.data ?? []).map((c) => c.key));
    const providers: ModelProvider[] = [];
    if (keys.has('anthropic_api_key')) providers.push('claude');
    if (keys.has('openai_api_key')) providers.push('pi-openai');
    if (keys.has('google_api_key')) providers.push('pi-google');
    return providers;
  }, [credentialsQuery.data]);

  const currentModelId = sessionQuery.data?.modelId ?? 'claude-sonnet-4-6';
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>('medium');

  const workspaceQuery = useQuery({
    queryKey: ['workspaces', 'get', workspaceId],
    queryFn: () => trpc.workspaces.get.query({ id: workspaceId }),
    staleTime: 60_000,
    enabled: workspaceId.length > 0,
  });
  const projectsQuery = useQuery({
    queryKey: ['projects', 'list', workspaceId],
    queryFn: () => trpc.projects.list.query({ workspaceId }),
    staleTime: 30_000,
    enabled: workspaceId.length > 0,
  });

  const sourcesQuery = useQuery({
    queryKey: ['sources', 'list', workspaceId],
    queryFn: () => trpc.sources.list.query({ workspaceId }),
    staleTime: 10_000,
    enabled: workspaceId.length > 0,
  });
  const enabledSourceSlugs = sessionQuery.data?.enabledSourceSlugs ?? [];
  const rejectedSourceSlugs = sessionQuery.data?.rejectedSourceSlugs ?? [];

  const {
    workingDirOptions,
    handleSourceSelectionChange,
    handleOpenConnections,
    handleWorkingDirChange,
    handlePickCustomDir,
  } = useComposerAffordances({
    sessionId,
    workspace: workspaceQuery.data,
    projects: projectsQuery.data,
    sessionQuery,
    navigate,
  });

  const handleModelChange = useCallback(
    async (modelId: string) => {
      const spec = findModel(modelId);
      const provider = spec ? modelProviderToSession(spec.provider) : undefined;
      try {
        await trpc.sessions.update.mutate({
          id: sessionId,
          patch: { modelId, ...(provider ? { provider } : {}) },
        });
        await sessionQuery.refetch();
      } catch (err) {
        toast.error(String(err));
      }
    },
    [sessionId, sessionQuery],
  );

  const handleSend = useCallback(
    (payload: ComposerSendPayload): void => {
      if (!agentAvailable) {
        toast.error(t('chat.runtime.pendingNotice'));
        return;
      }
      setIsStreaming(true);
      void trpc.sessions.sendMessage
        .mutate({ id: sessionId, text: payload.text })
        .catch((err: unknown) => {
          setIsStreaming(false);
          toast.error(formatSendError(err));
        });
    },
    [sessionId, agentAvailable, t],
  );

  const handleStop = useCallback(async (): Promise<void> => {
    try {
      await trpc.sessions.stopTurn.mutate({ id: sessionId });
      setIsStreaming(false);
    } catch (err) {
      toast.error(String(err));
    }
  }, [sessionId]);

  const handleRetryLast = useCallback(async (): Promise<void> => {
    try {
      await trpc.sessions.retryLastTurn.mutate({ id: sessionId });
      setIsStreaming(true);
    } catch (err) {
      toast.error(String(err));
    }
  }, [sessionId]);

  const handleRetryFromMessage = useCallback(
    (messageId: string): void => {
      const msgs = messagesQuery.data ?? [];
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx <= 0) {
        void handleRetryLast();
        return;
      }
      setPendingTruncateAt(idx - 1);
      setConfirmOpen(true);
    },
    [messagesQuery.data, handleRetryLast],
  );

  const handleConfirmTruncate = useCallback(async (): Promise<void> => {
    if (pendingTruncateAt === null) return;
    try {
      await trpc.sessions.truncateAfter.mutate({
        id: sessionId,
        afterSequence: pendingTruncateAt,
        confirm: true,
      });
      await invalidateMessages(queryClient, sessionId);
      await trpc.sessions.retryLastTurn.mutate({ id: sessionId });
      setIsStreaming(true);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setPendingTruncateAt(null);
    }
  }, [sessionId, pendingTruncateAt]);

  const handleSearch = useCallback(
    async (query: string) => trpc.messages.search.query({ sessionId, query }),
    [sessionId],
  );

  useSessionShortcuts({
    ...(isStreaming ? { onStop: () => void handleStop() } : {}),
    ...(isStreaming ? {} : { onRetry: () => void handleRetryLast() }),
  });

  const callbacks = useMemo<MessageCardCallbacks>(
    () => ({ onRetry: handleRetryFromMessage }),
    [handleRetryFromMessage],
  );

  const { modelLabel, providerLabel, handleRename, handleArchive } = useSessionHeader({
    sessionId,
    workspaceId,
    currentModelId,
    sessionQuery,
    navigate,
  });

  const { linkedProject, availableProjects, handleSelectProject, sessionBanners } =
    useSessionMetadata({
      sessionId,
      sessionQuery,
      projects: projectsQuery.data,
      agentAvailable,
      navigate,
    });

  return (
    <PermissionProvider>
      <div className="flex h-full">
        <div className="flex min-w-0 flex-1 flex-col">
          {sessionQuery.data ? (
            <>
              <SessionHeader
                name={sessionQuery.data.name}
                {...(modelLabel ? { modelLabel } : {})}
                {...(providerLabel ? { providerLabel } : {})}
                workingDirectory={sessionQuery.data.workingDirectory ?? null}
                onRename={handleRename}
                onArchive={() => void handleArchive()}
                {...(isStreaming ? {} : { onRetryLast: () => void handleRetryLast() })}
                onToggleMetadata={() => setMetadataOpen((v) => !v)}
                metadataOpen={metadataOpen}
              />
              <SessionActiveBadges
                {...(modelLabel ? { modelLabel } : {})}
                {...(providerLabel ? { providerLabel } : {})}
                workingDirectory={sessionQuery.data.workingDirectory ?? null}
                enabledSourceCount={enabledSourceSlugs.length}
                stickySourceCount={sessionQuery.data.stickyMountedSourceSlugs?.length ?? 0}
              />
              <SessionBanners banners={sessionBanners} />
            </>
          ) : null}
          <div className="min-h-0 flex-1">
            <TranscriptView
              sessionId={sessionId}
              messages={chatMessages}
              isStreaming={isStreaming}
              callbacks={callbacks}
              search={handleSearch}
              onSelectSuggestedPrompt={(p) => handleSend({ text: p.prompt, attachments: [] })}
            />
          </div>
          <div className="p-3">
            <Composer
              sessionId={sessionId}
              onSend={(payload) => void handleSend(payload)}
              {...(agentAvailable ? {} : { disabled: true })}
              mentionSources={sourcesQuery.data ?? []}
              affordances={{
                sourcePicker: (
                  <SourcePicker
                    sources={sourcesQuery.data ?? []}
                    enabledSlugs={enabledSourceSlugs}
                    rejectedSlugs={rejectedSourceSlugs}
                    onChange={(next) => void handleSourceSelectionChange(next)}
                    onOpenManage={handleOpenConnections}
                  />
                ),
                workingDirPicker: (
                  <WorkingDirPicker
                    value={sessionQuery.data?.workingDirectory ?? null}
                    options={workingDirOptions}
                    onSelect={(path) => void handleWorkingDirChange(path)}
                    onPickCustom={handlePickCustomDir}
                  />
                ),
                modelSelector: (
                  <ModelSelector
                    value={currentModelId}
                    onChange={(id) => void handleModelChange(id)}
                    availableProviders={availableProviders}
                  />
                ),
                thinkingSelector: (
                  <ThinkingLevelSelector
                    modelId={currentModelId}
                    value={thinkingLevel}
                    onChange={setThinkingLevel}
                  />
                ),
                partnersLabel: t('chat.composer.chip.partners'),
                onOpenPartners: () => toast.info(t('chat.composer.chip.partnersTodo')),
              }}
              {...(isStreaming ? { onStop: () => void handleStop(), isProcessing: true } : {})}
            />
          </div>
        </div>
        {sessionQuery.data ? (
          <SessionMetadataPanel
            open={metadataOpen}
            onClose={() => setMetadataOpen(false)}
            name={sessionQuery.data.name}
            onRename={handleRename}
            project={linkedProject}
            availableProjects={availableProjects}
            onSelectProject={handleSelectProject}
            onOpenProject={(id) =>
              void navigate({ to: '/projects/$projectId', params: { projectId: id } })
            }
            workingDirectory={sessionQuery.data.workingDirectory ?? null}
            onChooseWorkingDirectory={async () => {
              const picked = await handlePickCustomDir();
              if (picked) await handleWorkingDirChange(picked);
            }}
          />
        ) : null}
      </div>
      <ConfirmDestructiveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('chat.actions.truncateTitle')}
        description={t('chat.actions.truncateDescription')}
        onConfirm={() => void handleConfirmTruncate()}
      />
    </PermissionProvider>
  );
}

export const Route = createFileRoute('/_app/workspaces/$workspaceId/sessions/$sessionId')({
  component: SessionPage,
});
