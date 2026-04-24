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

/** Gerente de sessões — precisa apenas do método `interrupt` para `stopTurn`. */
export interface SessionManagerLike {
  interrupt(sessionId: SessionId): void;
}

export function respondPermission(
  broker: PermissionBroker,
  requestId: string,
  decision: PermissionDecision,
): Result<void, AppError> {
  const accepted = broker.respond(requestId, decision);
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

export function stopTurn(
  dispatcher: TurnDispatcherLike,
  sessionManager: SessionManagerLike,
  id: SessionId,
): Result<void, AppError> {
  const result = dispatcher.interrupt(id);
  if (result.isErr()) return err(result.error);
  sessionManager.interrupt(id);
  return ok(undefined);
}

export function notImplementedResult<T>(message: string): Result<T, AppError> {
  return err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message }));
}
