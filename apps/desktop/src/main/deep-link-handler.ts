/**
 * Roteador fino de deep-links `g4os://`. O main apenas recebe a URL,
 * valida (scheme + path whitelist), foca a janela e delega navegação
 * pro renderer via IPC `deep-link:navigate`.
 *
 * Sem regras de autenticação/permissão aqui — isso pertence às features
 * (renderer route guards). O handler só garante que o path é seguro pra
 * passar adiante (não traffica URL arbitrária pra `loadURL`).
 */

import { createLogger } from '@g4os/kernel/logger';
import type { BrowserWindowInstance } from './electron-runtime.ts';
import type { WindowManager } from './window-manager.ts';

const log = createLogger('deep-link');

const ACCEPTED_SCHEMES: readonly string[] = ['g4os:', 'g4os-internal:'];

// Hosts/paths reconhecidos. Qualquer deep-link novo precisa ser registrado
// aqui, idealmente com teste de adversarial input. ID/slug pattern:
// alphanum + dash + underscore, 1-64 chars (cobre UUIDs, slugs e nomes
// de categoria de settings sem precisar de regex separado por path).
const SAFE_ID = '[a-z0-9_-]{1,64}';
const PATH_WHITELIST: readonly RegExp[] = [
  /^\/?$/, // raiz — abre app
  new RegExp(`^/workspace/${SAFE_ID}/?$`, 'i'),
  new RegExp(`^/workspace/${SAFE_ID}/sessions/${SAFE_ID}/?$`, 'i'),
  new RegExp(`^/session/${SAFE_ID}/?$`, 'i'),
  new RegExp(`^/project/${SAFE_ID}/?$`, 'i'),
  /^\/settings\/?$/i,
  new RegExp(`^/settings/${SAFE_ID}/?$`, 'i'),
  /^\/migration\/?$/i,
  /^\/auth\/callback\/?$/i,
  /^\/oauth\/callback\/?$/i, // V1 alias — mesmo destino que auth/callback
  /^\/news\/?$/i,
  /^\/marketplace\/?$/i,
];

export const DEEP_LINK_NAVIGATE_CHANNEL = 'deep-link:navigate';

export class DeepLinkHandler {
  constructor(private readonly windowManager: WindowManager) {}

  readonly handle = (rawUrl: string): void => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      log.warn({ rawUrl }, 'invalid deep link');
      return;
    }

    if (!ACCEPTED_SCHEMES.includes(url.protocol)) {
      log.warn({ scheme: url.protocol }, 'deep link rejected: unknown scheme');
      return;
    }

    const path = url.pathname || '/';
    const allowed = PATH_WHITELIST.some((re) => re.test(path));
    if (!allowed) {
      log.warn({ host: url.host, path }, 'deep link rejected: path not whitelisted');
      return;
    }

    log.info({ host: url.host, path }, 'deep link received');

    // F-CR51-17: usa getMain() em vez de list()[0] — getMain() garante
    // a janela principal em cenários multi-window/deep-link concorrente.
    // list()[0] não é estável em JS Set quando janelas são criadas/destruídas
    // concorrentemente. ADR-0100.
    const existing = this.windowManager.getMain();
    if (!existing) {
      void this.windowManager.open({ url: rawUrl });
      return;
    }

    // Janela existente: foca + delega navegação pro renderer via IPC.
    // Renderer hook consome o channel e usa o TanStack Router pra ir
    // até a rota equivalente.
    const w = existing as BrowserWindowInstance & {
      isVisible?: () => boolean;
      show?: () => void;
      webContents?: { send?: (ch: string, payload: unknown) => void };
    };
    if (!w.isVisible?.()) w.show?.();
    w.focus();
    w.webContents?.send?.(DEEP_LINK_NAVIGATE_CHANNEL, {
      host: url.host,
      path,
      search: url.search,
    });
  };
}
