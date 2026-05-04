/**
 * Preload do Debug HUD.
 *
 * Carregado **apenas** na BrowserWindow do HUD — nunca no renderer
 * principal. Expõe `window.debugHud` via contextBridge:
 *
 *   - `subscribe(channel, handler) => unsubscribe`
 *       Registra listener para snapshots empurrados pelo aggregator
 *       (canal `debug-hud:snapshot`). Retorna disposer.
 *
 *   - `loadConfig() => Promise<unknown>` / `saveConfig(cfg)`
 *       Persistência da config de cards (ordem, visibility, opacity)
 *       em `~/.config/g4os/debug-hud.json`.
 *
 *   - `invoke(action, payload?)`
 *       Dispara uma das ações diagnósticas/destrutivas registradas em
 *       `main/debug-hud/index.ts` (`force-gc`, `cancel-turn`,
 *       `cancel-all-turns`, `reset-listeners`, `clear-logs`,
 *       `export-diagnostic`, `reload-renderer`). Retorna
 *       `{ ok: boolean, message?, path? }` para o renderer mostrar
 *       feedback inline.
 *
 * Sandbox + contextIsolation: este preload é CJS puro, sem Node além
 * de `electron`.
 */

import { contextBridge, ipcRenderer } from 'electron';

type Listener = (data: unknown) => void;

contextBridge.exposeInMainWorld('debugHud', {
  subscribe: (channel: string, handler: Listener): (() => void) => {
    const ipcChannel = `debug-hud:${channel}`;
    const wrapped = (_event: unknown, data: unknown): void => handler(data);
    ipcRenderer.on(ipcChannel, wrapped);
    return () => ipcRenderer.off(ipcChannel, wrapped);
  },
  loadConfig: (): Promise<unknown> => ipcRenderer.invoke('debug-hud:load-config'),
  saveConfig: (config: unknown): Promise<void> =>
    ipcRenderer.invoke('debug-hud:save-config', config),
  invoke: (action: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(`debug-hud:action:${action}`, payload),
  // F-CR31-11: leitura de metadata (versão, plataforma) — fora do
  // namespace `:action:` porque não é destrutivo.
  getAppMeta: (): Promise<unknown> => ipcRenderer.invoke('debug-hud:get-app-meta'),
});
