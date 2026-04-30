/**
 * Helpers de turn-control para `SessionsService` — permission response,
 * interrupt, retry/truncate stubs. Separados pra manter o service abaixo
 * do cap 300 LOC.
 */

import { AppError, ErrorCode } from '@g4os/kernel/errors';
import type { SessionId } from '@g4os/kernel/types';
import type { PermissionBroker, PermissionDecision } from '@g4os/permissions';
import { err, ok, type Result } from 'neverthrow';

/** Dispatcher genérico — qualquer coisa que saiba interromper um turn por sessão. */
export interface TurnDispatcherLike {
  interrupt(sessionId: SessionId): Result<void, AppError>;
}

export async function respondPermission(
  broker: PermissionBroker,
  requestId: string,
  decision: PermissionDecision,
): Promise<Result<void, AppError>> {
  // Respond agora é async (await persist allow_always). Helper
  // propaga o await para o caller do tRPC procedure.
  const accepted = await broker.respond(requestId, decision);
  if (!accepted) {
    return err(
      new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'unknown or already resolved permission request',
        context: { requestId },
      }),
    );
  }
  return ok(undefined);
}

export function stopTurn(dispatcher: TurnDispatcherLike, id: SessionId): Result<void, AppError> {
  return dispatcher.interrupt(id);
}

export function notImplementedResult<T>(message: string): Result<T, AppError> {
  return err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message }));
}
