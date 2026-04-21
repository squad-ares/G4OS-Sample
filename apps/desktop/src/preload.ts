/**
 * Preload script carregado no contexto isolado do renderer.
 *
 * Expõe `window.electronTRPC` via `contextBridge.exposeInMainWorld`, que
 * é a API suportada pelo `ipcLink` do `electron-trpc`. Nada além disso
 * deve ser exposto — o contrato público é a tipagem do `AppRouter`.
 *
 * Rodamos em sandbox: o preload é CJS puro e usa apenas `electron`.
 */

import { contextBridge, ipcRenderer } from 'electron';

const CHANNEL = 'electron-trpc';

type Listener = (args: unknown) => void;

contextBridge.exposeInMainWorld('electronTRPC', {
  sendMessage: (args: unknown): void => {
    ipcRenderer.send(CHANNEL, args);
  },
  onMessage: (callback: Listener): void => {
    ipcRenderer.on(CHANNEL, (_event, args: unknown) => {
      callback(args);
    });
  },
});
