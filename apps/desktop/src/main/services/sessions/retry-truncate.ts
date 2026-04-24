/**
 * Helpers de `retryLastTurn` + `truncateAfter` extraídos do
 * `SessionsService` para manter esse arquivo ≤ 300 LOC (gate
 * `check:main-size`). FOLLOWUP-08.
 *
 * O log append-only (`SessionEventStore`) continua sendo fonte de verdade;
 * os helpers reescrevem o JSONL e depois chamam `truncateProjection` pra
 * realinhar o índice SQLite (`messages_index` + `sessions`).
 */

import type { AppDb } from '@g4os/data';
import { SessionEventStore, truncateProjection } from '@g4os/data/events';
import type { SessionsRepository } from '@g4os/data/sessions';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import type { Session, SessionId } from '@g4os/kernel/types';
import { failure, notFoundError } from '@g4os/session-runtime';
import { err, ok, type Result } from 'neverthrow';

export async function truncateSessionAfter(
  deps: { readonly repo: SessionsRepository; readonly drizzle: AppDb },
  id: SessionId,
  after: number,
): Promise<Result<{ removed: number }, AppError>> {
  const session = await deps.repo.get(id);
  if (!session) return err(notFoundError(id));
  try {
    const store = new SessionEventStore(session.workspaceId);
    const removed = await store.truncateAfter(id, after);
    if (removed > 0) truncateProjection(deps.drizzle, id, after);
    return ok({ removed });
  } catch (error) {
    return failure('sessions.truncateAfter', error, { id });
  }
}

export interface RetryDispatch {
  dispatch(input: {
    readonly sessionId: SessionId;
    readonly text: string;
  }): Promise<Result<void, AppError>>;
}

export async function retryLastTurn(
  deps: {
    readonly repo: SessionsRepository;
    readonly drizzle: AppDb;
    readonly dispatcher: RetryDispatch;
  },
  id: SessionId,
): Promise<Result<void, AppError>> {
  const session = await deps.repo.get(id);
  if (!session) return err(notFoundError(id));
  try {
    const plan = await planRetry(session, id);
    if (plan.isErr()) return err(plan.error);
    const { cutoff, text } = plan.value;

    const store = new SessionEventStore(session.workspaceId);
    const removed = await store.truncateAfter(id, cutoff);
    if (removed > 0) truncateProjection(deps.drizzle, id, cutoff);

    const dispatchResult = await deps.dispatcher.dispatch({ sessionId: id, text });
    if (dispatchResult.isErr()) return err(dispatchResult.error);
    return ok(undefined);
  } catch (error) {
    return failure('sessions.retryLastTurn', error, { id });
  }
}

async function planRetry(
  session: Session,
  id: SessionId,
): Promise<Result<{ cutoff: number; text: string }, AppError>> {
  const store = new SessionEventStore(session.workspaceId);
  let lastUserSeq = -1;
  let secondLastUserSeq = -1;
  let lastUserText: string | null = null;
  for await (const event of store.read(id)) {
    if (event.type !== 'message.added' || event.message.role !== 'user') continue;
    secondLastUserSeq = lastUserSeq;
    lastUserSeq = event.sequenceNumber;
    const textBlock = event.message.content.find((b) => b.type === 'text');
    lastUserText = textBlock?.type === 'text' ? textBlock.text : null;
  }
  if (lastUserSeq < 0 || lastUserText === null || lastUserText.trim().length === 0) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: 'sessions.retryLastTurn: nenhuma mensagem de usuário para retry',
        context: { id },
      }),
    );
  }
  const cutoff = secondLastUserSeq >= 0 ? secondLastUserSeq : 0;
  return ok({ cutoff, text: lastUserText });
}
