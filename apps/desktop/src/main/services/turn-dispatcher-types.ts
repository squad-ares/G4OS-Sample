import type { AgentRegistry } from '@g4os/agents/interface';
import type { ToolCatalog } from '@g4os/agents/tools';
import type { CredentialVault } from '@g4os/credentials';
import type { MessagesService } from '@g4os/ipc/server';
import type { Message, Session, SessionId } from '@g4os/kernel/types';
import type { PermissionBroker } from '@g4os/permissions';
import type { SessionEventBus } from '@g4os/session-runtime';
import type { McpMountRegistry } from '@g4os/sources/broker';
import type { SourcesStore } from '@g4os/sources/store';
import type { SessionIntentUpdater } from './sessions/apply-intent.ts';

export type { SessionIntentUpdater };

export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6';
export const DEFAULT_CONNECTION_SLUG = 'anthropic-direct';
export const DEFAULT_MAX_TOKENS = 4096;

export interface TitleHook {
  /** Gera título refinado via LLM. Usado a partir do 2º turn. */
  scheduleGeneration(sessionId: SessionId, messages: readonly Message[]): void;
  /**
   * Paridade V1: trunca a 1ª user msg e grava como título imediato sem
   * chamar LLM. Chamado pelo dispatcher após o 1º turn ok pra dar feedback
   * instantâneo na sub-sidebar / header em vez de "Nova sessão".
   */
  scheduleImmediateFromFirstMessage(sessionId: SessionId, firstUserMessage: string): void;
}

export interface TurnDispatcherDeps {
  readonly messages: MessagesService;
  readonly registry: AgentRegistry;
  readonly eventBus: SessionEventBus;
  readonly permissionBroker: PermissionBroker;
  readonly toolCatalog: ToolCatalog;
  readonly sourcesStore: SourcesStore;
  readonly credentialVault?: CredentialVault | undefined;
  readonly mountRegistry?: McpMountRegistry;
  readonly titleGenerator?: TitleHook;
  readonly getSession: (id: SessionId) => Promise<Session | null>;
  readonly resolveWorkingDirectory: (session: Session | null) => string;
  readonly sessionIntentUpdater?: SessionIntentUpdater;
  readonly defaults?: Partial<TurnDispatchDefaults>;
}

export interface TurnDispatchDefaults {
  readonly modelId: string;
  readonly connectionSlug: string;
  readonly maxTokens: number;
  readonly systemPrompt?: string;
}

export interface TurnDispatchInput {
  readonly sessionId: SessionId;
  readonly text: string;
  /**
   * Workspace ID autoritativo do contexto que está disparando
   * o turn. Quando passado, o dispatcher rejeita sessions cuja
   * `workspaceId` não bate. Multi-tenant isolation hard-enforced.
   */
  readonly expectedWorkspaceId?: string;
}

export interface ActiveTurn {
  readonly turnId: string;
  readonly agent: import('@g4os/agents/interface').IAgent;
  readonly abortController: AbortController;
  subscription: { unsubscribe(): void } | null;
  readonly completion: Promise<unknown>;
  /** Timestamp do start para o Active Sessions Card. */
  readonly startedAt: number;
}
