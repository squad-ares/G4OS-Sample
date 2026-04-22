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
  BranchSessionInput,
  SessionListPage,
  SessionsService as SessionsServiceContract,
} from '@g4os/ipc/server';
import type { IDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import type {
  GlobalSearchResult,
  LabelId,
  Session,
  SessionEvent,
  SessionFilter,
  SessionId,
  WorkspaceId,
} from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import type { SessionManager } from './session-manager.ts';
import { failure, notFoundError } from './sessions/errors.ts';
import {
  appendCreatedEvent,
  appendLifecycleEvent,
  eventStoreReader,
  eventStoreWriter,
  type LifecycleEventKind,
} from './sessions/event-log.ts';

export interface SessionsServiceDeps {
  readonly db: Db;
  readonly drizzle: AppDb;
  readonly sessionManager: SessionManager;
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

  async update(id: SessionId, patch: Partial<Session>): Promise<Result<void, AppError>> {
    try {
      await this.#repo.update(id, patch);
      return ok(undefined);
    } catch (error) {
      return failure('sessions.update', error, { id });
    }
  }

  delete(id: SessionId): Promise<Result<void, AppError>> {
    return this.lifecycleMutation(id, 'sessions.delete', 'session.deleted', (rid) =>
      this.#repo.softDelete(rid),
    );
  }

  archive(id: SessionId): Promise<Result<void, AppError>> {
    return this.lifecycleMutation(id, 'sessions.archive', 'session.archived', (rid) =>
      this.#repo.archive(rid),
    );
  }

  /**
   * `session.restored` não está no schema de eventos (ADR-0010 enumera
   * apenas arquivar/deletar); o restore é representado por um
   * `session.flagged` com `reason: 'restored'` para preservar a
   * auditoria append-only sem quebrar o schema.
   */
  async restore(id: SessionId): Promise<Result<void, AppError>> {
    const session = await this.#repo.get(id);
    if (!session) return err(notFoundError(id));
    try {
      await appendLifecycleEvent(session.workspaceId, id, 'session.flagged', 0, {
        reason: 'restored',
      } as Partial<SessionEvent>);
      await this.#repo.restore(id);
      return ok(undefined);
    } catch (error) {
      return failure('sessions.restore', error, { id });
    }
  }

  pin(id: SessionId): Promise<Result<void, AppError>> {
    return this.simpleMutation(id, 'sessions.pin', () => this.#repo.pin(id));
  }

  unpin(id: SessionId): Promise<Result<void, AppError>> {
    return this.simpleMutation(id, 'sessions.unpin', () => this.#repo.unpin(id));
  }

  star(id: SessionId): Promise<Result<void, AppError>> {
    return this.simpleMutation(id, 'sessions.star', () => this.#repo.star(id));
  }

  unstar(id: SessionId): Promise<Result<void, AppError>> {
    return this.simpleMutation(id, 'sessions.unstar', () => this.#repo.unstar(id));
  }

  markRead(id: SessionId): Promise<Result<void, AppError>> {
    return this.simpleMutation(id, 'sessions.markRead', () => this.#repo.markRead(id));
  }

  markUnread(id: SessionId): Promise<Result<void, AppError>> {
    return this.simpleMutation(id, 'sessions.markUnread', () => this.#repo.markUnread(id));
  }

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
    return this.#deps.sessionManager.subscribe(id, (raw) => {
      handler(raw as SessionEvent);
    });
  }

  stopTurn(id: SessionId): Promise<Result<void, AppError>> {
    this.#deps.sessionManager.interrupt(id);
    return Promise.resolve(ok(undefined));
  }

  retryLastTurn(_id: SessionId): Promise<Result<void, AppError>> {
    return Promise.resolve(
      err(
        new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: 'sessions.retryLastTurn not yet wired to worker protocol',
        }),
      ),
    );
  }

  truncateAfter(
    _id: SessionId,
    _afterSequence: number,
  ): Promise<Result<{ removed: number }, AppError>> {
    return Promise.resolve(
      err(
        new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: 'sessions.truncateAfter requires event-store integration (TASK-11-00)',
        }),
      ),
    );
  }

  private async lifecycleMutation(
    id: SessionId,
    scope: string,
    eventKind: LifecycleEventKind,
    mutation: (id: SessionId) => Promise<void>,
  ): Promise<Result<void, AppError>> {
    const session = await this.#repo.get(id);
    if (!session) return err(notFoundError(id));
    try {
      await appendLifecycleEvent(session.workspaceId, id, eventKind, 0);
      await mutation(id);
      return ok(undefined);
    } catch (error) {
      return failure(scope, error, { id });
    }
  }

  private async simpleMutation(
    id: SessionId,
    scope: string,
    mutation: () => Promise<void>,
  ): Promise<Result<void, AppError>> {
    try {
      await mutation();
      return ok(undefined);
    } catch (error) {
      return failure(scope, error, { id });
    }
  }
}

export function createSessionsService(deps: SessionsServiceDeps): SessionsServiceContract {
  return new SqliteSessionsService(deps);
}
