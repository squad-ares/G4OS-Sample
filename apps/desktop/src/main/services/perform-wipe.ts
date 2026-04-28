/**
 * Reset destrutivo orquestrado para `auth.wipeAndReset`. Apaga workspaces
 * (cascade SQL via `workspaces.delete`), credenciais (loop sobre `vault.list`)
 * e relança o app. Logout já foi feito pelo serviço de auth antes deste
 * callback rodar, então não precisamos mexer em token aqui.
 *
 * Falhas parciais propagam como `Result.err`. O caller (auth-runtime) já
 * tratou logout e cuida da resposta IPC.
 */

import type { CredentialVault } from '@g4os/credentials';
import type { WorkspacesService } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { ElectronApp } from '../electron-runtime.ts';

export interface WipeDeps {
  readonly app: Pick<ElectronApp, 'relaunch' | 'exit'>;
  readonly workspaces: WorkspacesService;
  readonly vault: CredentialVault;
}

export function createPerformWipe(deps: WipeDeps): () => Promise<Result<void, AppError>> {
  return async () => {
    try {
      const wsList = await deps.workspaces.list();
      if (wsList.isOk()) {
        for (const ws of wsList.value) {
          await deps.workspaces.delete(ws.id, { removeFiles: true });
        }
      }
      const credList = await deps.vault.list();
      if (credList.isOk()) {
        for (const meta of credList.value) {
          await deps.vault.delete(meta.key);
        }
      }
      // relaunch + exit garante UI fresca sem state in-memory residual
      deps.app.relaunch();
      deps.app.exit(0);
      return ok(undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return err(
        new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: `wipeAndReset failed: ${message}`,
        }),
      );
    }
  };
}
