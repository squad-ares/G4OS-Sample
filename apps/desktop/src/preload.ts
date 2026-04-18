/**
 * Preload script carregado no contexto isolado do renderer.
 *
 * Expõe `window.electronTRPC` via `exposeElectronTRPC()` para que o
 * `ipcLink` do renderer possa despachar chamadas tRPC. Nada além disso
 * deve ser exposto — o contrato público é a tipagem do `AppRouter`.
 *
 * O módulo `electron-trpc/main` é resolvido em runtime pelo processo de
 * preload do Electron.
 */

export async function exposeTrpcBridge(): Promise<void> {
  try {
    const specifier = 'electron-trpc/main';
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      exposeElectronTRPC: () => void;
    };
    mod.exposeElectronTRPC();
  } catch {
    // fora do runtime do Electron (vitest, typecheck)
  }
}

if (typeof process !== 'undefined' && typeof process.once === 'function') {
  process.once('loaded', () => {
    void exposeTrpcBridge();
  });
}
