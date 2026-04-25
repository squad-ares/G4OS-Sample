import * as nodeFs from 'node:fs';
import { existsSync } from 'node:fs';
import * as nodePath from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVault } from '@g4os/credentials';
import { SessionsRepository } from '@g4os/data/sessions';
import { createLogger } from '@g4os/kernel/logger';
import { PermissionBroker, PermissionStore } from '@g4os/permissions';
import { getAppPaths, isMacOS } from '@g4os/platform';
import { SessionEventBus } from '@g4os/session-runtime';
import { SourcesStore } from '@g4os/sources/store';
import { createStubAgentFactory } from './agents/stub-agent-factory.ts';
import { providerForVaultKey, registerAgents } from './agents-bootstrap.ts';
import { AppLifecycle } from './app-lifecycle.ts';
import { DeepLinkHandler } from './deep-link-handler.ts';
import { loadElectron } from './electron-runtime.ts';
import { initIpcServer } from './ipc-bootstrap.ts';
import { readRuntimeEnv } from './runtime-env.ts';
import { createAuthRuntime } from './services/auth-runtime.ts';
import { CpuPool } from './services/cpu-pool.ts';
import { createCredentialsService } from './services/credentials-service.ts';
import { initDatabase } from './services/db-service.ts';
import { createLabelsService } from './services/labels-service.ts';
import { SqliteMessagesService } from './services/messages-service.ts';
import { createNewsService } from './services/news-service.ts';
import { createObservabilityRuntime } from './services/observability-runtime.ts';
import { createPermissionsService } from './services/permissions-service.ts';
import { createPlatformService } from './services/platform-service.ts';
import { createProjectsService } from './services/projects-service.ts';
import { SessionsCleanupScheduler } from './services/sessions-cleanup-scheduler.ts';
import { createSessionsService } from './services/sessions-service.ts';
import { createMountRegistry } from './services/sources/mount-bootstrap.ts';
import { createSourcesService } from './services/sources-service.ts';
import { buildIntentUpdater, buildToolCatalog } from './services/tools-bootstrap.ts';
import { TurnDispatcher } from './services/turn-dispatcher.ts';
import { createWindowsService } from './services/windows-service.ts';
import { createWorkspaceTransferService } from './services/workspace-transfer-service.ts';
import { createWorkspacesService } from './services/workspaces-service.ts';
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

function resolveIconPath(opts: {
  readonly isPackaged: boolean;
  readonly rootDir: string;
}): string | undefined {
  const base = opts.isPackaged
    ? resolve(process.resourcesPath, 'resources/icon.png')
    : resolve(opts.rootDir, 'apps/desktop/resources/icon.png');
  return existsSync(base) ? base : undefined;
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
  const cpuPool = new CpuPool();
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const iconPath = resolveIconPath({ isPackaged: electron.app.isPackaged, rootDir });
  if (iconPath && isMacOS() && !electron.app.isPackaged && electron.app.dock) {
    electron.app.dock.setIcon(iconPath);
  }

  const windowManager = new WindowManager(electron, {
    ...(iconPath ? { iconPath } : {}),
    defaultPreloadPath: preloadPath,
    defaultRendererUrl: rendererUrl,
  });
  const windowsService = createWindowsService({ windowManager });
  const platformService = createPlatformService(electron);

  const credentialVault = await createVault({
    mode: electron.app.isPackaged ? 'prod' : 'dev',
  });

  const appPaths = getAppPaths();
  const migrationsFolder = electron.app.isPackaged
    ? resolve(process.resourcesPath, 'drizzle')
    : resolve(rootDir, 'packages/data/drizzle');
  const database = await initDatabase({
    filename: join(appPaths.data, 'app.db'),
    migrationsFolder,
  });
  const workspacesService = createWorkspacesService({
    drizzle: database.drizzle,
    resolveRootPath: (id: string) => appPaths.workspace(id),
    managedRoot: join(appPaths.data, 'workspaces'),
  });
  const workspaceTransferService = createWorkspaceTransferService({
    workspaces: workspacesService,
  });
  const messagesService = new SqliteMessagesService({ drizzle: database.drizzle });
  const sessionEventBus = new SessionEventBus();

  const isE2E = readRuntimeEnv('G4OS_E2E') === '1';
  const agentsRuntime = await registerAgents({
    credentialVault,
    // biome-ignore lint/style/noProcessEnv: composition root; sanctioned env read
    env: process.env,
    ...(isE2E ? { factories: [createStubAgentFactory()] } : {}),
  });

  const credentialsService = createCredentialsService({
    vault: credentialVault,
    onMutation: async (key) => {
      if (providerForVaultKey(key) !== null) await agentsRuntime.refresh();
    },
  });

  const sessionsRepo = new SessionsRepository(database.drizzle);

  const sourcesStore = new SourcesStore({
    resolveWorkspaceRoot: (id) => appPaths.workspace(id),
  });
  const sourcesService = createSourcesService({ store: sourcesStore });

  const permissionStore = new PermissionStore({
    resolveWorkspaceRoot: (id) => appPaths.workspace(id),
  });
  const permissionsService = createPermissionsService({ store: permissionStore });

  const permissionBroker = new PermissionBroker(
    (request) => {
      sessionEventBus.emit(request.sessionId, {
        type: 'turn.permission_required',
        sessionId: request.sessionId,
        turnId: request.turnId,
        requestId: request.requestId,
        toolUseId: request.toolUseId,
        toolName: request.toolName,
        inputJson: request.inputJson,
      });
    },
    { store: permissionStore },
  );

  const toolCatalog = buildToolCatalog({ sourcesStore, sessionsRepo });
  const mountRegistry = createMountRegistry();

  const turnDispatcher = new TurnDispatcher({
    messages: messagesService,
    registry: agentsRuntime.registry,
    eventBus: sessionEventBus,
    permissionBroker,
    toolCatalog,
    sourcesStore,
    mountRegistry,
    getSession: async (id) => (await sessionsRepo.get(id)) ?? null,
    resolveWorkingDirectory: (session) =>
      session?.workingDirectory ?? appPaths.workspace(session?.workspaceId ?? 'default'),
    sessionIntentUpdater: buildIntentUpdater(sessionsRepo),
  });
  const sessionsService = createSessionsService({
    db: database.db,
    drizzle: database.drizzle,
    eventBus: sessionEventBus,
    turnDispatcher,
    agentRuntime: {
      get available() {
        return agentsRuntime.status().providers.length > 0;
      },
      get providers() {
        return agentsRuntime.status().providers;
      },
    },
    permissionBroker,
  });
  const labelsService = createLabelsService({ drizzle: database.drizzle });
  const newsService = createNewsService();
  const projectsService = createProjectsService({
    drizzle: database.drizzle,
    workspacesRootPath: join(appPaths.data, 'workspaces'),
  });
  const sessionsCleanup = new SessionsCleanupScheduler({ drizzle: database.drizzle });
  sessionsCleanup.start();

  const authRuntime = createAuthRuntime({
    rootDir,
    skipDotEnv: electron.app.isPackaged,
    // biome-ignore lint/style/noProcessEnv: composition root; reads sanctioned here
    envSource: process.env,
    credentialVault,
    mockAuthMode: isE2E,
  });

  if (!authRuntime.configured) {
    log.warn({ missingEnv: authRuntime.missingEnv }, 'supabase auth not configured');
  }

  lifecycle.onQuit(() => mountRegistry.dispose());
  lifecycle.onQuit(() => turnDispatcher.dispose());
  lifecycle.onQuit(() => sessionEventBus.dispose());
  lifecycle.onQuit(() => cpuPool.destroy());
  lifecycle.onQuit(() => authRuntime.dispose());
  lifecycle.onQuit(() => sessionsCleanup.dispose());
  lifecycle.onQuit(() => database.db.dispose());
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
      workspaces: workspacesService,
      sessions: sessionsService,
      messages: messagesService,
      labels: labelsService,
      news: newsService,
      projects: projectsService,
      credentials: credentialsService,
      permissions: permissionsService,
      windows: windowsService,
      workspaceTransfer: workspaceTransferService,
      platform: platformService,
      sources: sourcesService,
    },
  });
  await windowManager.load(mainWindow, { url: rendererUrl, openDevTools: isDev });

  log.info({ preloadPath, rendererUrl }, 'main ready');
}

// Logger de último recurso — escreve em arquivo determinístico antes de
// pino estar disponível. Garante diagnóstico no app empacotado quando o
// crash acontece cedo (vault, env, native module).
function writeStartupCrashLog(label: string, err: unknown): void {
  try {
    // biome-ignore lint/style/noProcessEnv: composition root
    const tmp = process.env['TMPDIR'] ?? '/tmp';
    const message =
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
    nodeFs.writeFileSync(
      nodePath.join(tmp, `g4os-${label}.log`),
      `[${new Date().toISOString()}] ${message}\n`,
      { flag: 'a' },
    );
  } catch {
    // ignore — last-resort logging
  }
}

void bootstrapMain().catch((err: unknown) => {
  writeStartupCrashLog('startup-error', err);
  log.fatal({ err }, 'fatal startup error');
  process.exit(1);
});

// Captura erros não tratados antes do bootstrap completar
process.on('uncaughtException', (err) => {
  writeStartupCrashLog('uncaught', err);
  process.exit(1);
});
