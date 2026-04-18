/**
 * Ligação fina entre o `WindowManager` e o roteador tRPC. Mantida aqui
 * para que `index.ts` permaneça pequeno e `ipc-server.ts` continue
 * responsável apenas pela integração com `electron-trpc/main`.
 */

import { createIpcServer } from './ipc-server.ts';
import type { WindowManager } from './window-manager.ts';

export interface IpcBootstrapOptions {
  readonly windowManager: WindowManager;
}

export async function initIpcServer(options: IpcBootstrapOptions): Promise<void> {
  await createIpcServer({ windows: options.windowManager.list() });
}
