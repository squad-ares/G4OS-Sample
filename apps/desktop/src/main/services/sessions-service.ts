/**
 * SessionsService — composition root que implementa o contract definido
 * em `@g4os/ipc/server` sobre `SessionsRepository` (@g4os/data/sessions).
 *
 * Divisão em helpers (`sessions/event-log`, `sessions/errors`) mantém
 * este arquivo como dispatch: cada método é uma linha que delega para o
 * repo + trata erros. Lifecycle mutators publicam evento no JSONL
 * antes de atualizar o índice SQLite (fonte de verdade append-only).
 */

import type { AppDb, Db } from '@g4os/data';
import { SessionEventStore } from '@g4os/data/events';
import { globalSearch as globalSearchQuery } from '@g4os/data/queries';
import { branchSession as branchSessionHelper, SessionsRepository } from '@g4os/data/sessions';
import type {
  AgentRuntimeStatus,
  BranchSessionInput,
  SessionListPage,
  SessionsService as SessionsServiceContract,
} from '@g4os/ipc/server';
import type { IDisposable } from '@g4os/kernel/disposable';
import type { AppError } from '@g4os/kernel/errors';
import { isPersistedSessionEvent, isTurnStreamEvent } from '@g4os/kernel/schemas';
import type {
  GlobalSearchResult,
  LabelId,
  Session,
  SessionEvent,
  SessionFilter,
  SessionId,
  TurnStreamEvent,
  WorkspaceId,
} from '@g4os/kernel/types';
import type { PermissionBroker, PermissionDecision } from '@g4os/permissions';
import {
  appendCreatedEvent,
  eventStoreReader,
  eventStoreWriter,
  failure,
  notFoundError,
  respondPermission as respondPermissionOp,
  type SessionEventBus,
  simpleMutation,
  stopTurn as stopTurnOp,
} from '@g4os/session-runtime';
import { err, ok, type Result } from 'neverthrow';
import { archiveSession, restoreSession, softDeleteSession } from './sessions/lifecycle.ts';
import { retryLastTurn, truncateSessionAfter } from './sessions/retry-truncate.ts';
import type { TurnDispatcher } from './turn-dispatcher.ts';

export interface SessionsServiceDeps {
  readonly db: Db;
  readonly drizzle: AppDb;
  readonly eventBus: SessionEventBus;
  readonly turnDispatcher: TurnDispatcher;
  readonly agentRuntime: { readonly available: boolean; readonly providers: readonly string[] };
  readonly permissionBroker: PermissionBroker;
}

export class SqliteSessionsService implements SessionsServiceContract {
  readonly #deps: SessionsServiceDeps;
  readonly #repo: SessionsRepository;

  constructor(deps: SessionsServiceDeps) {
    this.#deps = deps;
    this.#repo = new SessionsRepository(deps.drizzle);
  }

  async list(workspaceId: WorkspaceId): Promise<Result<readonly Session[], AppError>> {
    try {
      const items = await this.#repo.list({
        workspaceId,
        lifecycle: 'active',
        limit: 500,
        offset: 0,
      });
      return ok(items);
    } catch (error) {
      return failure('sessions.list', error, { workspaceId });
    }
  }

  async listFiltered(filter: SessionFilter): Promise<Result<SessionListPage, AppError>> {
    try {
      const items = await this.#repo.list(filter);
      const total = await this.#repo.count(filter);
      return ok({ items, total, hasMore: filter.offset + items.length < total });
    } catch (error) {
      return failure('sessions.listFiltered', error, { workspaceId: filter.workspaceId });
    }
  }

  async get(id: SessionId): Promise<Result<Session, AppError>> {
    try {
      const session = await this.#repo.get(id);
      if (!session) return err(notFoundError(id));
      return ok(session);
    } catch (error) {
      return failure('sessions.get', error, { id });
    }
  }

  async create(input: Pick<Session, 'workspaceId' | 'name'>): Promise<Result<Session, AppError>> {
    try {
      const created = await this.#repo.create(input);
      await appendCreatedEvent(created.workspaceId, created.id, created.name, 'system@g4os.local');
      return ok(created);
    } catch (error) {
      return failure('sessions.create', error, { workspaceId: input.workspaceId });
    }
  }

  /**
   * Patches sem implicação no log append-only (rename visual, flags UI,
   * sources habilitadas) vão direto pro SQLite. Renames e provider/model
   * changes deveriam eventualmente emitir eventos dedicados — fica como
   * melhoria em cima do schema de eventos quando precisarmos rastreá-los
   * em replay.
   */
  async update(id: SessionId, patch: Partial<Session>): Promise<Result<void, AppError>> {
    try {
      await this.#repo.update(id, patch);
      return ok(undefined);
    } catch (error) {
      return failure('sessions.update', error, { id });
    }
  }

  delete = (id: SessionId) =>
    softDeleteSession({ repo: this.#repo, drizzle: this.#deps.drizzle }, id);

  archive = (id: SessionId) =>
    archiveSession({ repo: this.#repo, drizzle: this.#deps.drizzle }, id);

  restore = (id: SessionId) =>
    restoreSession({ repo: this.#repo, drizzle: this.#deps.drizzle }, id);

  pin = (id: SessionId) => simpleMutation(id, 'sessions.pin', () => this.#repo.pin(id));
  unpin = (id: SessionId) => simpleMutation(id, 'sessions.unpin', () => this.#repo.unpin(id));
  star = (id: SessionId) => simpleMutation(id, 'sessions.star', () => this.#repo.star(id));
  unstar = (id: SessionId) => simpleMutation(id, 'sessions.unstar', () => this.#repo.unstar(id));
  markRead = (id: SessionId) =>
    simpleMutation(id, 'sessions.markRead', () => this.#repo.markRead(id));
  markUnread = (id: SessionId) =>
    simpleMutation(id, 'sessions.markUnread', () => this.#repo.markUnread(id));

  async branch(input: BranchSessionInput): Promise<Result<Session, AppError>> {
    const source = await this.#repo.get(input.sourceId);
    if (!source) return err(notFoundError(input.sourceId));
    try {
      const eventStore = new SessionEventStore(source.workspaceId);
      const created = await branchSessionHelper(input, {
        repository: this.#repo,
        reader: eventStoreReader(eventStore),
        writer: eventStoreWriter(eventStore),
      });
      return ok(created);
    } catch (error) {
      return failure('sessions.branch', error, { sourceId: input.sourceId });
    }
  }

  async listBranches(parentId: SessionId): Promise<Result<readonly Session[], AppError>> {
    try {
      const items = await this.#repo.listBranches(parentId);
      return ok(items);
    } catch (error) {
      return failure('sessions.listBranches', error, { parentId });
    }
  }

  async setLabels(id: SessionId, labelIds: readonly LabelId[]): Promise<Result<void, AppError>> {
    try {
      await this.#repo.setLabels(id, labelIds);
      return ok(undefined);
    } catch (error) {
      return failure('sessions.setLabels', error, { id });
    }
  }

  async getLabels(id: SessionId): Promise<Result<readonly LabelId[], AppError>> {
    try {
      const ids = await this.#repo.getLabelIds(id);
      return ok(ids);
    } catch (error) {
      return failure('sessions.getLabels', error, { id });
    }
  }

  globalSearch(
    workspaceId: WorkspaceId,
    query: string,
  ): Promise<Result<GlobalSearchResult, AppError>> {
    try {
      const result = globalSearchQuery(this.#deps.db, workspaceId, query);
      return Promise.resolve(ok(result));
    } catch (error) {
      return Promise.resolve(failure('sessions.globalSearch', error, { workspaceId }));
    }
  }

  subscribe(id: SessionId, handler: (event: SessionEvent) => void): IDisposable {
    return this.#deps.eventBus.subscribe(id, (event) => {
      // Only forward persisted SessionEvents upstream; transient turn.* events
      // are consumed by bus subscribers interested in streaming UI and do not
      // enter the tRPC session stream typed schema.
      if (isPersistedSessionEvent(event)) handler(event);
    });
  }

  subscribeStream(id: SessionId, handler: (event: TurnStreamEvent) => void): IDisposable {
    return this.#deps.eventBus.subscribe(id, (event) => {
      if (isTurnStreamEvent(event)) handler(event);
    });
  }

  async sendMessage(id: SessionId, text: string): Promise<Result<void, AppError>> {
    try {
      const result = await this.#deps.turnDispatcher.dispatch({ sessionId: id, text });
      if (result.isErr()) return err(result.error);
      return ok(undefined);
    } catch (error) {
      return failure('sessions.sendMessage', error, { id });
    }
  }

  runtimeStatus(): Promise<Result<AgentRuntimeStatus, AppError>> {
    return Promise.resolve(
      ok({
        available: this.#deps.agentRuntime.available,
        providers: [...this.#deps.agentRuntime.providers],
      }),
    );
  }

  respondPermission(id: string, d: PermissionDecision): Promise<Result<void, AppError>> {
    return Promise.resolve(respondPermissionOp(this.#deps.permissionBroker, id, d));
  }

  stopTurn(id: SessionId): Promise<Result<void, AppError>> {
    return Promise.resolve(stopTurnOp(this.#deps.turnDispatcher, id));
  }

  truncateAfter(id: SessionId, after: number): Promise<Result<{ removed: number }, AppError>> {
    return truncateSessionAfter({ repo: this.#repo, drizzle: this.#deps.drizzle }, id, after);
  }

  /**
   * Refaz o último turno: localiza a última mensagem do usuário no log
   * append-only, trunca tudo depois do penúltimo user message (removendo
   * a última user msg + a resposta do assistant falha/indesejada) e
   * redispara via dispatcher com o mesmo texto. Se só houver uma user
   * msg, tronca para logo após `session.created` (sequence 0).
   */
  retryLastTurn(id: SessionId): Promise<Result<void, AppError>> {
    return retryLastTurn(
      {
        repo: this.#repo,
        drizzle: this.#deps.drizzle,
        dispatcher: this.#deps.turnDispatcher,
      },
      id,
    );
  }
}

export function createSessionsService(deps: SessionsServiceDeps): SessionsServiceContract {
  return new SqliteSessionsService(deps);
}
