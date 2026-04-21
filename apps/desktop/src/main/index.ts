import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVault } from '@g4os/credentials';
import { createLogger } from '@g4os/kernel/logger';
import { AppLifecycle } from './app-lifecycle.ts';
import { DeepLinkHandler } from './deep-link-handler.ts';
import { loadElectron } from './electron-runtime.ts';
import { initIpcServer } from './ipc-bootstrap.ts';
import { ProcessSupervisor } from './process/supervisor.ts';
import { readRuntimeEnv } from './runtime-env.ts';
import { createAuthRuntime } from './services/auth-runtime.ts';
import { CpuPool } from './services/cpu-pool.ts';
import { createObservabilityRuntime } from './services/observability-runtime.ts';
import { SessionManager } from './services/session-manager.ts';
import { StartupPreflightService } from './startup-preflight-service.ts';
import { WindowManager } from './window-manager.ts';

const log = createLogger('main');

export interface BootstrapOptions {
  readonly preloadPath?: string;
  readonly rendererUrl?: string;
}

function resolveRendererTargets(): { preloadPath: string; rendererUrl: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  const preloadPath = resolve(here, '../preload/preload.cjs');
  const devServer = readRuntimeEnv('ELECTRON_RENDERER_URL');
  const rendererUrl = devServer ? devServer : `file://${resolve(here, '../renderer/index.html')}`;
  return { preloadPath, rendererUrl };
}

export async function bootstrapMain(options: BootstrapOptions = {}): Promise<void> {
  const electron = await loadElectron();
  if (!electron) {
    log.warn('electron runtime unavailable; main boot skipped');
    return;
  }

  await electron.app.whenReady();

  const observability = await createObservabilityRuntime({
    serviceName: '@g4os/desktop',
    serviceVersion: electron.app.getVersion(),
    environment: electron.app.isPackaged ? 'production' : 'development',
  });

  const preflight = new StartupPreflightService();
  const preflightReport = await preflight.run({
    isPackaged: electron.app.isPackaged,
    rootDir: resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'),
  });
  if (preflightReport.status === 'fatal') {
    electron.dialog?.showErrorBox(
      'Build incompleta do G4 OS',
      preflight.formatFatalDialog(preflightReport),
    );
    electron.app.exit(1);
    return;
  }

  const defaults = resolveRendererTargets();
  const preloadPath = options.preloadPath ?? defaults.preloadPath;
  const rendererUrl = options.rendererUrl ?? defaults.rendererUrl;

  const lifecycle = new AppLifecycle(electron.app);
  const supervisor = new ProcessSupervisor(electron);
  const sessions = new SessionManager(supervisor);
  const cpuPool = new CpuPool();
  const windowManager = new WindowManager(electron);
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

  const credentialVault = await createVault({
    mode: electron.app.isPackaged ? 'prod' : 'dev',
  });

  const authRuntime = createAuthRuntime({
    rootDir,
    skipDotEnv: electron.app.isPackaged,
    // biome-ignore lint/style/noProcessEnv: composition root; reads sanctioned here
    envSource: process.env,
    credentialVault,
  });

  if (!authRuntime.configured) {
    log.warn(
      { missingEnv: authRuntime.missingEnv, filesLoaded: authRuntime.filesLoaded },
      'supabase auth not configured; otp login remains disabled until .env is provided',
    );
  }

  lifecycle.onQuit(() => sessions.dispose());
  lifecycle.onQuit(() => supervisor.shutdownAll());
  lifecycle.onQuit(() => cpuPool.destroy());
  lifecycle.onQuit(() => authRuntime.dispose());
  lifecycle.onQuit(() => {
    void observability.dispose();
  });
  lifecycle.onAllWindowsClosed(() => {
    if (process.platform !== 'darwin') electron.app.quit();
  });

  const deepLinks = new DeepLinkHandler(windowManager);
  lifecycle.onOpenUrl(deepLinks.handle);

  const isDev = !electron.app.isPackaged;
  const mainWindow = await windowManager.create({ preloadPath });

  await initIpcServer({
    windowManager,
    services: {
      auth: authRuntime.service,
    },
  });
  await windowManager.load(mainWindow, { url: rendererUrl, openDevTools: isDev });

  log.info({ preloadPath, rendererUrl }, 'main ready');
}

void bootstrapMain().catch((err: unknown) => {
  log.fatal({ err }, 'fatal startup error');
  process.exit(1);
});
