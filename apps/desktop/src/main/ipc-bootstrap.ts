import type { ServicesStatusMap } from '@g4os/ipc/server';
import type { IpcServiceOverrides } from './ipc-context.ts';
import { createIpcServer, type IpcServerWindow } from './ipc-server.ts';
import type { WindowManager } from './window-manager.ts';

export interface IpcBootstrapOptions {
  readonly windowManager: WindowManager;
  readonly services?: IpcServiceOverrides;
  readonly servicesStatus?: () => Promise<ServicesStatusMap>;
}

export async function initIpcServer(options: IpcBootstrapOptions): Promise<void> {
  await createIpcServer({
    windows: options.windowManager.list(),
    ...(options.services ? { services: options.services } : {}),
    ...(options.servicesStatus ? { servicesStatus: options.servicesStatus } : {}),
    // Cobre janelas criadas após o boot (multi-window via WindowsService,
    // deep-link, debug-hud). Sem isso, só janelas existentes no boot têm
    // cleanup de subscriptions órfãs.
    onWindowCreated: (listener) => {
      options.windowManager.onWindowCreated((win) => listener(win as IpcServerWindow));
    },
  });
}
