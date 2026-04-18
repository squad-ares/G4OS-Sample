/**
 * Roteador fino de deep-links `g4os://`. O main apenas recebe a URL e
 * delega para o alvo correto (janela existente ou nova). Intencionalmente
 * sem regras de autenticação/permissão — isso pertence às features.
 */

import { createLogger } from '@g4os/kernel/logger';
import type { WindowManager } from './window-manager.ts';

const log = createLogger('deep-link');

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

    log.info({ host: url.host, path: url.pathname }, 'deep link received');

    const [existing] = this.windowManager.list();
    if (!existing) {
      void this.windowManager.open({ url: rawUrl });
    }
  };
}
