/**
 * Helper para spawn do Electron em processo isolado para cada teste.
 *
 * Cada teste ganha uma `userDataDir` tmpdir separada (evita colisão de
 * DB/credentials entre runs). O main é carregado de
 * `apps/desktop/dist/main/index.js` — caller precisa ter rodado
 * `pnpm --filter @g4os/desktop build` antes de rodar a suíte.
 */

import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type ElectronApplication, _electron as electron, type Page } from '@playwright/test';

export interface LaunchedApp {
  readonly app: ElectronApplication;
  readonly window: Page;
  readonly userDataDir: string;
  close(): Promise<void>;
}

export interface LaunchOptions {
  /** Env vars extras para o main process. */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Quando `'mock'`, seta `G4OS_E2E=1` no ambiente e o main inicializa
   * com auth pré-autenticada + stub agent factory. Default `'none'` deixa
   * o app carregar como se fosse um fresh install (login screen, etc.).
   */
  readonly auth?: 'mock' | 'none';
  /**
   * Passa `--js-flags=--expose-gc` para o Electron, expondo `globalThis.gc`
   * no main process. Necessário para gates de memória (memlab) que precisam
   * coletar garbage determinístico antes de medir heap delta — sem isso,
   * `globalThis.gc` é `undefined` e a chamada vira no-op silencioso,
   * deixando lixo coletável inflar o delta e gerando falsos positivos.
   */
  readonly forceGc?: boolean;
}

const DESKTOP_REPO_ROOT = resolve(
  // desktop-e2e/tests/helpers/ -> up 3 -> monorepo root
  new URL('../../../..', import.meta.url).pathname,
);

const DESKTOP_MAIN_ENTRY = resolve(DESKTOP_REPO_ROOT, 'apps/desktop/out/main/index.js');

export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(resolve(tmpdir(), 'g4os-e2e-'));
  const app = await electron.launch({
    args: [
      DESKTOP_MAIN_ENTRY,
      `--user-data-dir=${userDataDir}`,
      ...(options.forceGc ? ['--js-flags=--expose-gc'] : []),
    ],
    env: {
      // biome-ignore lint/style/noProcessEnv: E2E harness legitimate read — composition root for Electron spawn
      ...process.env,
      NODE_ENV: 'test',
      ...(options.auth === 'mock' ? { G4OS_E2E: '1' } : {}),
      ...options.env,
    } as Record<string, string>,
  });
  const window = await app.firstWindow({ timeout: 30_000 });
  return {
    app,
    window,
    userDataDir,
    close: async () => {
      await app.close();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}
