import type { IpcServiceOverrides } from './ipc-context.ts';
import { createIpcServer } from './ipc-server.ts';
import type { WindowManager } from './window-manager.ts';

export interface IpcBootstrapOptions {
  readonly windowManager: WindowManager;
  readonly services?: IpcServiceOverrides;
}

export async function initIpcServer(options: IpcBootstrapOptions): Promise<void> {
  await createIpcServer({
    windows: options.windowManager.list(),
    ...(options.services ? { services: options.services } : {}),
  });
}
