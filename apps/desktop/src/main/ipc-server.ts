/**
 * Liga o router tRPC ao transporte Electron via electron-trpc/main.
 *
 * O handler é criado apenas quando o módulo `electron-trpc/main` está
 * disponível em runtime; durante typecheck/lint o pacote `@g4os/desktop`
 * não precisa de `electron`/`electron-trpc` instalados.
 */

import { appRouter, type IpcInvokeEventLike } from '@g4os/ipc/server';
import { createContext } from './ipc-context.ts';

export interface IpcServerWindow {
  readonly webContents: { readonly id: number };
}

export interface CreateIpcServerOptions {
  readonly windows: readonly IpcServerWindow[];
}

export async function createIpcServer(options: CreateIpcServerOptions): Promise<void> {
  const electronTrpc = await loadElectronTrpc();
  if (!electronTrpc) return;

  electronTrpc.createIPCHandler({
    router: appRouter,
    windows: options.windows,
    createContext: ({ event }) => createContext({ event: event as IpcInvokeEventLike }),
  });
}

interface ElectronTrpcMain {
  createIPCHandler(options: {
    router: typeof appRouter;
    windows: readonly IpcServerWindow[];
    createContext: (args: { event: unknown }) => unknown;
  }): void;
}

async function loadElectronTrpc(): Promise<ElectronTrpcMain | null> {
  try {
    const specifier = 'electron-trpc/main';
    const mod = (await import(/* @vite-ignore */ specifier)) as unknown;
    return mod as ElectronTrpcMain;
  } catch {
    return null;
  }
}
