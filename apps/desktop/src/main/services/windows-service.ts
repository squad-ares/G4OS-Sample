import type { WindowsService as WindowsServiceContract } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { WorkspaceId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import type { WindowManager } from '../window-manager.ts';

const log = createLogger('windows-service');

export interface WindowsServiceDeps {
  readonly windowManager: WindowManager;
}

export function createWindowsService(deps: WindowsServiceDeps): WindowsServiceContract {
  return {
    async openWorkspaceWindow(workspaceId: WorkspaceId): Promise<Result<void, AppError>> {
      try {
        await deps.windowManager.openForWorkspace(workspaceId);
        return ok(undefined);
      } catch (error) {
        log.error({ err: error, workspaceId }, 'failed to open workspace window');
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'failed to open workspace window',
            context: { workspaceId },
            cause: error,
          }),
        );
      }
    },
  };
}
