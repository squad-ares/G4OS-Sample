/**
 * Entry-point fino do main process.
 *
 * Orquestra ciclo de vida, janelas, IPC e supervisor de processos. Toda
 * lógica de domínio vive em pacotes/features ou em workers isolados.
 * Meta: main total < 2000 LOC com cada arquivo ≤ 300 LOC.
 */

import { createLogger } from '@g4os/kernel/logger';
import { AppLifecycle } from './app-lifecycle.ts';
import { DeepLinkHandler } from './deep-link-handler.ts';
import { loadElectron } from './electron-runtime.ts';
import { initIpcServer } from './ipc-bootstrap.ts';
import { ProcessSupervisor } from './process/supervisor.ts';
import { CpuPool } from './services/cpu-pool.ts';
import { SessionManager } from './services/session-manager.ts';
import { WindowManager } from './window-manager.ts';

const log = createLogger('main');

export interface BootstrapOptions {
  readonly preloadPath?: string;
  readonly rendererUrl?: string;
}

export async function bootstrapMain(options: BootstrapOptions = {}): Promise<void> {
  const electron = await loadElectron();
  if (!electron) {
    log.warn('electron runtime unavailable; main boot skipped');
    return;
  }

  await electron.app.whenReady();

  const lifecycle = new AppLifecycle(electron.app);
  const supervisor = new ProcessSupervisor(electron);
  const sessions = new SessionManager(supervisor);
  const cpuPool = new CpuPool();
  const windowManager = new WindowManager(electron);

  lifecycle.onQuit(() => sessions.dispose());
  lifecycle.onQuit(() => supervisor.shutdownAll());
  lifecycle.onQuit(() => cpuPool.destroy());
  lifecycle.onAllWindowsClosed(() => {
    if (process.platform !== 'darwin') electron.app.quit();
  });

  const deepLinks = new DeepLinkHandler(windowManager);
  lifecycle.onOpenUrl(deepLinks.handle);

  await windowManager.open({
    ...(options.preloadPath ? { preloadPath: options.preloadPath } : {}),
    ...(options.rendererUrl ? { url: options.rendererUrl } : {}),
  });

  await initIpcServer({ windowManager });

  log.info('main ready');
}

void bootstrapMain().catch((err: unknown) => {
  log.fatal({ err }, 'fatal startup error');
  process.exit(1);
});
