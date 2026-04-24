import type { SessionsRepository } from '@g4os/data/sessions';
import type { AppError } from '@g4os/kernel/errors';
import type { SessionEvent, SessionId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import { failure, notFoundError } from './errors.ts';
import { appendLifecycleEvent, type LifecycleEventKind } from './event-log.ts';

export async function lifecycleMutation(
  repo: SessionsRepository,
  id: SessionId,
  scope: string,
  eventKind: LifecycleEventKind,
  mutation: (id: SessionId) => Promise<void>,
  meta?: Partial<SessionEvent>,
): Promise<Result<void, AppError>> {
  const session = await repo.get(id);
  if (!session) return err(notFoundError(id));
  try {
    await appendLifecycleEvent(session.workspaceId, id, eventKind, 0, meta);
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
