import type { SessionEventStore } from '@g4os/data/events';
import type { SessionsRepository } from '@g4os/data/sessions';
import type { AppError } from '@g4os/kernel/errors';
import type { SessionEvent, SessionId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import { failure, notFoundError } from './errors.ts';
import { appendLifecycleEvent, emitLifecycleEvent, type LifecycleEventKind } from './event-log.ts';

export interface LifecycleMutationOptions {
  /**
   * Callback opcional que aplica o evento no reducer SQLite
   * (`@g4os/data/events/applyEvent`). Quando fornecido, `lifecycleMutation`
   * mantém `sessions.lastEventSequence` em sync com o JSONL.
   */
  readonly applyReducer?: (event: SessionEvent) => void;
  readonly meta?: Partial<SessionEvent>;
  /** Injeção opcional — por default usa `SessionEventStore(workspaceId)`. */
  readonly eventStore?: Pick<SessionEventStore, 'append'>;
}

export async function lifecycleMutation(
  repo: SessionsRepository,
  id: SessionId,
  scope: string,
  eventKind: LifecycleEventKind,
  mutation: (id: SessionId) => Promise<void>,
  options: LifecycleMutationOptions = {},
): Promise<Result<void, AppError>> {
  const session = await repo.get(id);
  if (!session) return err(notFoundError(id));
  try {
    if (options.applyReducer) {
      await emitLifecycleEvent(
        {
          workspaceId: session.workspaceId,
          currentSequence: session.lastEventSequence,
          applyReducer: options.applyReducer,
          ...(options.eventStore ? { eventStore: options.eventStore } : {}),
        },
        id,
        eventKind,
        options.meta,
      );
    } else {
      await appendLifecycleEvent(
        session.workspaceId,
        id,
        eventKind,
        session.lastEventSequence + 1,
        options.meta,
        options.eventStore,
      );
    }
    await mutation(id);
    return ok(undefined);
  } catch (error) {
    return failure(scope, error, { id });
  }
}

export async function simpleMutation(
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
