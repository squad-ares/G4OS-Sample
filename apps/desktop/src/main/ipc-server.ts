import {
  cleanupSubscriptionsForSender,
  ELECTRON_TRPC_CHANNEL,
  type ETRPCRequest,
  handleIpcRequest,
  type IpcInvokeEventLike,
  type IpcReplyEventLike,
} from '@g4os/ipc/server';
import { createLogger } from '@g4os/kernel/logger';
import { createContext, type IpcServiceOverrides } from './ipc-context.ts';

const log = createLogger('ipc-server');

export interface IpcServerWindow {
  readonly webContents: {
    readonly id: number;
    on?(event: string, listener: (...args: unknown[]) => void): void;
  };
}

export interface CreateIpcServerOptions {
  readonly windows: readonly IpcServerWindow[];
  readonly services?: IpcServiceOverrides;
}

export async function createIpcServer(options: CreateIpcServerOptions): Promise<void> {
  const ipcMain = await loadIpcMain();
  if (!ipcMain) return;

  ipcMain.on(ELECTRON_TRPC_CHANNEL, (event: IpcReplyEventLike, request: ETRPCRequest) => {
    void handleIpcRequest(event, request, (ev, opts) =>
      createContext({
        event: ev as IpcInvokeEventLike,
        ...(options.services ? { services: options.services } : {}),
        ...(opts?.traceparent ? { traceparent: opts.traceparent } : {}),
      }),
    ).catch((err: unknown) => {
      log.error({ err }, 'unhandled IPC request error');
    });
  });

  // Cleanup de subscriptions órfãs em reload do renderer.
  // electron-trpc client recria todas as subscriptions após did-finish-load,
  // mas as antigas continuavam no Map global (`activeSubscriptions`)
  // tentando emitir para um sender que já dropou os listeners. Hook no
  // `did-start-navigation` pega o caso comum (Cmd+R, electron-vite HMR,
  // navigation programática); fallback em `destroyed` cobre window close.
  for (const window of options.windows) {
    const wc = window.webContents;
    if (typeof wc.on !== 'function') continue;
    const senderId = wc.id;
    wc.on('did-start-navigation', () => cleanupSubscriptionsForSender(senderId));
    wc.on('destroyed', () => cleanupSubscriptionsForSender(senderId));
  }
}

interface ElectronIpcMain {
  on(channel: string, listener: (event: IpcReplyEventLike, message: ETRPCRequest) => void): void;
}

async function loadIpcMain(): Promise<ElectronIpcMain | null> {
  try {
    const specifier = 'electron';
    const mod = (await import(/* @vite-ignore */ specifier)) as { ipcMain?: ElectronIpcMain };
    return mod.ipcMain ?? null;
  } catch {
    return null;
  }
}
