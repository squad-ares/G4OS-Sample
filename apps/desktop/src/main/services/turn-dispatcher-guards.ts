import { AppError, ErrorCode } from '@g4os/kernel/errors';
import type { Session, SessionId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import type { TurnDispatchInput } from './turn-dispatcher-types.ts';

/**
 * Valida que a session existe, tem workspaceId definido e, quando
 * `expectedWorkspaceId` é fornecido, que bate com o contexto ativo.
 * Multi-tenant isolation gate: impede que um sessionId construído fora
 * do contexto correto (deep-link malicioso, IDs colidindo em legacy import)
 * execute turn em workspace arbitrário.
 */
export async function resolveOwnerSession(
  getSession: (id: SessionId) => Promise<Session | null>,
  input: TurnDispatchInput,
): Promise<Result<Session & { workspaceId: string }, AppError>> {
  const { sessionId, expectedWorkspaceId } = input;

  const ownerSession = await getSession(sessionId);
  if (!ownerSession) {
    return err(
      new AppError({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'session not found',
        context: { sessionId },
      }),
    );
  }
  if (!ownerSession.workspaceId) {
    return err(
      new AppError({
        code: ErrorCode.SESSION_CORRUPTED,
        message: 'session has no workspace ownership; refusing dispatch',
        context: { sessionId },
      }),
    );
  }
  if (expectedWorkspaceId && expectedWorkspaceId !== ownerSession.workspaceId) {
    return err(
      new AppError({
        code: ErrorCode.SESSION_CORRUPTED,
        message: 'session workspace does not match active workspace context',
        context: {
          sessionId,
          sessionWorkspace: ownerSession.workspaceId,
          expected: expectedWorkspaceId,
        },
      }),
    );
  }
  return ok(ownerSession as Session & { workspaceId: string });
}
