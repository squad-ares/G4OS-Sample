/**
 * PermissionsService real (main) sobre `PermissionStore`. Expõe list/
 * revoke/clearAll via IPC. Phase 2 MVP: só decisões `allow_always` de
 * tool use. Sources sticky/rejected por sessão continuam em
 * `sessions.update`.
 */

import type { PermissionsService } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { WorkspaceId } from '@g4os/kernel/types';
import type { PermissionStore } from '@g4os/permissions';
import { err, ok } from 'neverthrow';

const log = createLogger('permissions-service');

export interface PermissionsServiceDeps {
  readonly store: PermissionStore;
}

export function createPermissionsService(deps: PermissionsServiceDeps): PermissionsService {
  const { store } = deps;
  return {
    async list(workspaceId: WorkspaceId) {
      try {
        return ok(await store.list(workspaceId));
      } catch (error) {
        return err(wrap('permissions.list', error, { workspaceId }));
      }
    },

    async revoke(workspaceId: WorkspaceId, toolName: string, argsHash: string) {
      try {
        const removed = await store.revoke(workspaceId, toolName, argsHash);
        if (!removed) {
          return err(
            new AppError({
              code: ErrorCode.VALIDATION_ERROR,
              message: 'decision not found',
              context: { workspaceId, toolName, argsHash },
            }),
          );
        }
        return ok(undefined);
      } catch (error) {
        return err(wrap('permissions.revoke', error, { workspaceId, toolName }));
      }
    },

    async clearAll(workspaceId: WorkspaceId) {
      try {
        const removed = await store.clearAll(workspaceId);
        return ok({ removed });
      } catch (error) {
        return err(wrap('permissions.clearAll', error, { workspaceId }));
      }
    },
  };
}

function wrap(op: string, error: unknown, ctx: Record<string, unknown> = {}): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  log.error({ err: message, op, ...ctx }, 'permissions service op failed');
  return new AppError({ code: ErrorCode.UNKNOWN_ERROR, message, context: { op, ...ctx } });
}
