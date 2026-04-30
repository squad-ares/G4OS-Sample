/**
 * Helpers de resolução de caminhos do renderer (preload + URL) e do icon.
 * Extraídos do composition root para manter `index.ts ≤ 300 LOC` (gate `check:main-size`).
 *
 * Resolução em runtime: `electron-vite` empacota o main em
 * `apps/desktop/out/main/index.cjs` (single-file bundle). Em runtime
 * `here = apps/desktop/out/main/`, então `../preload/preload.cjs`
 * resolve para `apps/desktop/out/preload/preload.cjs` (correto).
 *
 * **Bug histórico:** estava `'../../preload/preload.cjs'` — dois
 * níveis acima — apontando para `apps/desktop/preload/preload.cjs`,
 * caminho que não existe. Resultado: dev/prod boot quebrava com
 * `ENOENT` no preload e renderer perdia `electronTRPC`.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuntimeEnv } from '../runtime-env.ts';

export interface RendererTargets {
  readonly preloadPath: string;
  readonly rendererUrl: string;
  /** Preload do Debug HUD. */
  readonly hudPreloadPath: string;
  /** URL do renderer do Debug HUD. */
  readonly hudRendererUrl: string;
}

export function resolveRendererTargets(): RendererTargets {
  const here = dirname(fileURLToPath(import.meta.url));
  const preloadPath = resolve(here, '../preload/preload.cjs');
  const hudPreloadPath = resolve(here, '../preload/preload-debug-hud.cjs');
  const devServer = readRuntimeEnv('ELECTRON_RENDERER_URL');
  const rendererUrl = devServer ? devServer : `file://${resolve(here, '../renderer/index.html')}`;
  // O HUD vive em `src/renderer/debug-hud/index.html` (dentro do root do
  // Vite renderer — fora dele, dev server retorna 404 ou SPA fallback e
  // o JS nunca carrega). Em dev, Vite serve em `/debug-hud/`. Em
  // packaged, electron-vite gera `out/renderer/debug-hud/index.html`.
  const hudRendererUrl = devServer
    ? `${devServer.replace(/\/$/, '')}/debug-hud/`
    : `file://${resolve(here, '../renderer/debug-hud/index.html')}`;
  return { preloadPath, rendererUrl, hudPreloadPath, hudRendererUrl };
}

export function resolveIconPath(opts: {
  readonly isPackaged: boolean;
  readonly rootDir: string;
}): string | undefined {
  const base = opts.isPackaged
    ? resolve(process.resourcesPath, 'resources/icon.png')
    : resolve(opts.rootDir, 'apps/desktop/resources/icon.png');
  return existsSync(base) ? base : undefined;
}
