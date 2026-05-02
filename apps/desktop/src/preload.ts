/**
 * Preload script carregado no contexto isolado do renderer.
 *
 * Expõe `window.electronTRPC` via `contextBridge.exposeInMainWorld`, que
 * é a API suportada pelo `ipcLink` do `electron-trpc`. Nada além disso
 * deve ser exposto — o contrato público é a tipagem do `AppRouter`.
 *
 * Rodamos em sandbox: o preload é CJS puro e usa apenas `electron`.
 *
 * **NÃO remover listeners do channel `electron-trpc`** — múltiplos clientes
 * tRPC podem ser criados na mesma renderer (ex: client direto em
 * `trpc-client.ts` + client React Query em `TRPCProvider`), e CADA um chama
 * `electronTRPC.onMessage(callback)` no construtor do `ipcLink`. O
 * electron-trpc faz dispatch broadcast: TODOS os listeners ativos recebem a
 * resposta IPC e cada client filtra por requestId no nível dele.
 *
 * Não remover o listener anterior antes de registrar novo — tentativa
 * anterior (revertida) causava o seguinte: o segundo `onMessage` "rouba" o
 * segundo `onMessage` "rouba" o canal do primeiro, e o client que ficou
 * sem listener nunca mais recebe respostas. Sintoma: requests pendurados
 * para sempre, app preso em "Carregando ambiente…". O leak teórico de
 * listeners em hot-reload do renderer é tolerável (some no full reload).
 */

// `@sentry/electron/preload` instala `window.__SENTRY_IPC__` via contextBridge,
// habilitando `IPCMode.Classic` (canal Electron IPC nativo). Sem isso, o
// renderer cai no fallback Protocol → fetch `sentry-ipc://...`, que falha com
// "URL scheme 'sentry-ipc' is not supported" porque o scheme não foi
// registrado como privileged. Import precisa rodar no preload (contexto
// isolado com acesso a contextBridge), antes do bundle do renderer.
import '@sentry/electron/preload';

import { contextBridge, ipcRenderer } from 'electron';

const CHANNEL = 'electron-trpc';
const NEW_TURN_CHANNEL = 'global:new-turn';
const DEEP_LINK_CHANNEL = 'deep-link:navigate';

interface DeepLinkPayload {
  readonly host: string;
  readonly path: string;
  readonly search: string;
}

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

// Bridge mínima para shortcuts globais. Renderer subscreve
// pra reagir a atalhos OS-level (Cmd+Shift+N → focar composer).
contextBridge.exposeInMainWorld('g4osShortcuts', {
  onNewTurn: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(NEW_TURN_CHANNEL, handler);
    return () => ipcRenderer.removeListener(NEW_TURN_CHANNEL, handler);
  },
});

// Bridge pra deep-links. Main valida path/scheme; renderer router
// converte `{host, path}` em rota e navega.
contextBridge.exposeInMainWorld('g4osDeepLinks', {
  onNavigate: (callback: (payload: DeepLinkPayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: DeepLinkPayload) => callback(payload);
    ipcRenderer.on(DEEP_LINK_CHANNEL, handler);
    return () => ipcRenderer.removeListener(DEEP_LINK_CHANNEL, handler);
  },
});
