/**
 * Tipo global do bridge `window.debugHud` exposto pelo
 * `preload-debug-hud.ts`.
 *
 * Mantido em arquivo `.d.ts` próprio (não em `app.tsx`) para que tanto
 * o orquestrador quanto os hooks vejam o mesmo contrato sem ciclo.
 */

declare global {
  interface Window {
    debugHud?: {
      subscribe(channel: string, handler: (data: unknown) => void): () => void;
      loadConfig(): Promise<unknown>;
      saveConfig(config: unknown): Promise<void>;
      invoke(action: string, payload?: unknown): Promise<unknown>;
      getAppMeta(): Promise<unknown>;
    };
  }
}

export type {};
