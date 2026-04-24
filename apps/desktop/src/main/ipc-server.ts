import {
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
  readonly webContents: { readonly id: number };
}

export interface CreateIpcServerOptions {
  readonly windows: readonly IpcServerWindow[];
  readonly services?: IpcServiceOverrides;
}

export async function createIpcServer(options: CreateIpcServerOptions): Promise<void> {
  const ipcMain = await loadIpcMain();
  if (!ipcMain) return;

  ipcMain.on(ELECTRON_TRPC_CHANNEL, (event: IpcReplyEventLike, request: ETRPCRequest) => {
    void handleIpcRequest(event, request, (ev) =>
      createContext({
        event: ev as IpcInvokeEventLike,
        ...(options.services ? { services: options.services } : {}),
      }),
    ).catch((err: unknown) => {
      log.error({ err }, 'unhandled IPC request error');
    });
  });
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
