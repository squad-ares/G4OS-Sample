/**
 * Roteador fino de deep-links `g4os://`. O main apenas recebe a URL e
 * delega para o alvo correto (janela existente ou nova). Intencionalmente
 * sem regras de autenticação/permissão — isso pertence às features.
 */

import { createLogger } from '@g4os/kernel/logger';
import type { WindowManager } from './window-manager.ts';

const log = createLogger('deep-link');

// CR6-15: scheme + path whitelist. URLs `g4os://` que não casem com um
// destino conhecido são rejeitadas — evita trafficking de path arbitrário
// pra `windowManager.open` (que viraria URL do renderer).
const ACCEPTED_SCHEMES: readonly string[] = ['g4os:', 'g4os-internal:'];
// Hosts/paths reconhecidos. Qualquer deep-link novo precisa ser registrado
// aqui, idealmente com teste de adversarial input.
const PATH_WHITELIST: readonly RegExp[] = [
  /^\/?$/, // raiz
  /^\/workspace\/[a-z0-9-]{1,64}\/?$/i,
  /^\/session\/[a-z0-9-]{1,64}\/?$/i,
  /^\/auth\/callback\/?$/i,
];

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

    const [existing] = this.windowManager.list();
    if (!existing) {
      void this.windowManager.open({ url: rawUrl });
    }
  };
}
