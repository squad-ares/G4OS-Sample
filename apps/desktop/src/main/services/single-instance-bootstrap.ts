/**
 * Single-instance lock + protocol registration. CR-18 F-DT-I.
 *
 * Sem isso, o sistema operacional NUNCA entrega URLs `g4os://...` ao app:
 * `setAsDefaultProtocolClient` é o opt-in oficial em Windows/Linux. Em
 * macOS o handler também precisa ser registrado em build empacotada para
 * `app.on('open-url')` ser disparado.
 *
 * Em Windows/Linux, deep-links abrem uma SEGUNDA instância do app — sem
 * `requestSingleInstanceLock`, a 2ª instância sobe em paralelo, dispara
 * `before-quit` na 1ª (lifecycle de single-window assumption) e rouba
 * estado. O lock garante que abrir um deep-link FOQUE a janela existente
 * em vez de inicializar do zero.
 */

import { resolve as resolvePath } from 'node:path';
import type { Logger } from '@g4os/kernel/logger';
import { getProtocolName, isWindows } from '@g4os/platform';
import type { DeepLinkHandler } from '../deep-link-handler.ts';
import type { ElectronRuntime } from '../electron-runtime.ts';

export interface SingleInstanceContext {
  readonly acquired: boolean;
}

// CR-23 F-CR23-3: PROTOCOL via `getProtocolName()` em `@g4os/platform`.
// Antes (CR-22 F-CR22-3) o helper local `resolveProtocol` re-derivava inline
// a regra do FLAVOR — corrigia o bug original de hardcode mas duplicava a
// lógica que vive em `paths.ts`. Centralizar em `@g4os/platform` evita drift
// quando um terceiro consumer (auto-update, telemetria) precisar do nome.
const PROTOCOL = getProtocolName();
const PROTOCOL_PREFIX = `${PROTOCOL}://`;

/**
 * Tenta adquirir o lock exclusivo da instância. Deve ser chamado ANTES de
 * `app.whenReady()` — se outra instância já roda, retorna `acquired: false`
 * e o caller deve `app.quit()` imediatamente. A 2ª instância dispara
 * `second-instance` na 1ª, que a partir daí processa argv (deep-links em
 * Windows/Linux) e foca a janela existente.
 */
export function acquireSingleInstance(electron: ElectronRuntime): SingleInstanceContext {
  // Em E2E e alguns runtimes stub, `requestSingleInstanceLock` pode não
  // existir. Trata como "acquired" para não bloquear smoke tests.
  if (typeof electron.app.requestSingleInstanceLock !== 'function') {
    return { acquired: true };
  }
  return { acquired: electron.app.requestSingleInstanceLock() };
}

export function registerProtocolClient(electron: ElectronRuntime, log: Logger): void {
  if (typeof electron.app.setAsDefaultProtocolClient !== 'function') return;

  // Windows dev: precisa do exec path do Electron + path do script bundlado
  // pra Squirrel não tentar rodar o launcher errado quando o user abre uma
  // URL `g4os://...`. Em produção (`isPackaged`) e em macOS/Linux, o
  // electron auto-resolve.
  let registered = false;
  try {
    if (isWindows() && !electron.app.isPackaged && process.argv[1]) {
      registered = electron.app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        resolvePath(process.argv[1]),
      ]);
    } else {
      registered = electron.app.setAsDefaultProtocolClient(PROTOCOL);
    }
  } catch (err) {
    log.warn({ err }, 'setAsDefaultProtocolClient threw; protocol not registered');
    return;
  }
  if (registered) {
    log.info({ protocol: PROTOCOL }, 'protocol client registered');
  } else {
    log.warn({ protocol: PROTOCOL }, 'setAsDefaultProtocolClient returned false');
  }
}

/**
 * Wireia o evento `second-instance` para focar a janela existente e rotear
 * o deep-link extraído do argv da 2ª instância (Windows/Linux). macOS
 * entrega via `open-url`, já tratado pelo `lifecycle.onOpenUrl`.
 */
export function wireSecondInstance(
  electron: ElectronRuntime,
  deepLinks: DeepLinkHandler,
  log: Logger,
): void {
  if (typeof electron.app.on !== 'function') return;
  electron.app.on('second-instance', (_event, argv) => {
    const url = argv.find((arg) => typeof arg === 'string' && arg.startsWith(PROTOCOL_PREFIX));
    if (url) {
      log.info({ url }, 'second-instance deep-link forwarded');
      deepLinks.handle(url);
    } else {
      // F-CR51-16: sem URL — foca a janela principal existente.
      // Antes apenas logava debug, sem nenhum foco visual. UX: usuário
      // clicando no atalho 2x ou dock icon espera que o app apareça.
      // Delegado ao focusMainWindow para manter wireSecondInstance testável
      // sem acesso ao módulo electron completo. ADR-0158.
      log.debug('second-instance signaled without deep-link; focusing main window');
      focusMainWindow(log);
    }
  });
}

/**
 * Foca a janela principal via dynamic import do módulo electron.
 * F-CR51-16: extração separada para manter `wireSecondInstance` testável.
 */
function focusMainWindow(log: Logger): void {
  void (async () => {
    try {
      const specifier = 'electron';
      const mod = (await import(/* @vite-ignore */ specifier)) as {
        BrowserWindow?: {
          getAllWindows(): readonly { isVisible(): boolean; show(): void; focus(): void }[];
        };
      };
      const wins = mod.BrowserWindow?.getAllWindows() ?? [];
      const first = wins[0];
      if (first) {
        if (!first.isVisible()) first.show();
        first.focus();
      }
    } catch (err) {
      log.warn({ err }, 'second-instance focus failed');
    }
  })();
}

/**
 * Procura por deep-link no argv da PRIMEIRA instância. Em macOS, deep-link
 * de cold-start chega via `open-url`. Em Windows/Linux, vem como argv.
 */
export function consumeBootstrapArgvDeepLink(deepLinks: DeepLinkHandler, log: Logger): void {
  const url = process.argv.find(
    (arg) => typeof arg === 'string' && arg.startsWith(PROTOCOL_PREFIX),
  );
  if (url) {
    log.info({ url }, 'bootstrap argv deep-link forwarded');
    deepLinks.handle(url);
  }
}
