/**
 * Wrappers finos de lifecycle (delete/archive/restore) sobre
 * `lifecycleMutation` + `emitLifecycleEvent`. Extraído de
 * `SessionsService` pra manter o arquivo ≤ 300 LOC.
 *
 * Todos usam `applyReducer` pra manter `sessions.lastEventSequence` em
 * sync com o JSONL append-only — sem isso o SQLite fica com sequence
 * defasado e o próximo `messages.append` colide.
 */

import type { AppDb } from '@g4os/data';
import { applyEvent } from '@g4os/data/events';
import type { SessionsRepository } from '@g4os/data/sessions';
import type { AppError } from '@g4os/kernel/errors';
import type { SessionEvent, SessionId } from '@g4os/kernel/types';
import {
  emitLifecycleEvent,
  failure,
  lifecycleMutation,
  notFoundError,
} from '@g4os/session-runtime';
import { err, ok, type Result } from 'neverthrow';

export interface LifecycleDeps {
  readonly repo: SessionsRepository;
  readonly drizzle: AppDb;
}

export function makeApplyReducer(drizzle: AppDb): (event: SessionEvent) => void {
  return (event) => applyEvent(drizzle, event);
}

export function softDeleteSession(
  deps: LifecycleDeps,
  id: SessionId,
): Promise<Result<void, AppError>> {
  return lifecycleMutation(
    deps.repo,
    id,
    'sessions.delete',
    'session.deleted',
    (rid) => deps.repo.softDelete(rid),
    { applyReducer: makeApplyReducer(deps.drizzle) },
  );
}

export function archiveSession(
  deps: LifecycleDeps,
  id: SessionId,
): Promise<Result<void, AppError>> {
  return lifecycleMutation(
    deps.repo,
    id,
    'sessions.archive',
    'session.archived',
    (rid) => deps.repo.archive(rid),
    { applyReducer: makeApplyReducer(deps.drizzle) },
  );
}

/**
 * `session.restored` não está no schema de eventos (ADR-0010 enumera
 * apenas arquivar/deletar); o restore é representado por um
 * `session.flagged` com `reason: 'restored'` para preservar a
 * auditoria append-only sem quebrar o schema.
 */
export async function restoreSession(
  deps: LifecycleDeps,
  id: SessionId,
): Promise<Result<void, AppError>> {
  const session = await deps.repo.get(id);
  if (!session) return err(notFoundError(id));
  try {
    await emitLifecycleEvent(
      {
        workspaceId: session.workspaceId,
        currentSequence: session.lastEventSequence,
        applyReducer: makeApplyReducer(deps.drizzle),
      },
      id,
      'session.flagged',
      { reason: 'restored' } as Partial<SessionEvent>,
    );
    await deps.repo.restore(id);
    return ok(undefined);
  } catch (error) {
    return failure('sessions.restore', error, { id });
  }
}
