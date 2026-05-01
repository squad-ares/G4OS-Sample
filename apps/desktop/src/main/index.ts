import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSupabaseEnvFiles } from '@g4os/auth/supabase';
import { createVault } from '@g4os/credentials';
import { SessionsRepository } from '@g4os/data/sessions';
import { setIpcMetricsRecorder } from '@g4os/ipc/server';
import { createLogger } from '@g4os/kernel/logger';
import { ipcMetrics } from '@g4os/observability/ipc';
import { PermissionBroker, PermissionStore } from '@g4os/permissions';
import { getAppPaths, isMacOS } from '@g4os/platform';
import { SessionEventBus } from '@g4os/session-runtime';
import { SourcesStore } from '@g4os/sources/store';
import { createStubAgentFactory } from './agents/stub-agent-factory.ts';
import { providerForVaultKey, registerAgents } from './agents-bootstrap.ts';
import { AppLifecycle } from './app-lifecycle.ts';
import { createDebugHudRuntime, type DebugHudRuntime } from './debug-hud/index.ts';
import { DeepLinkHandler } from './deep-link-handler.ts';
import { loadElectron } from './electron-runtime.ts';
import { registerGlobalShortcuts } from './global-shortcuts.ts';
import { initIpcServer } from './ipc-bootstrap.ts';
import { readRuntimeEnv } from './runtime-env.ts';
import { createAuthRuntime } from './services/auth-runtime.ts';
import { createBackupScheduler } from './services/backup-bootstrap.ts';
import { scheduleOrphanTmpCleanup } from './services/cleanup-orphan-tmp-bootstrap.ts';
import { CpuPool } from './services/cpu-pool.ts';
import { createCredentialsService } from './services/credentials-service.ts';
import { initDatabase } from './services/db-service.ts';
import { createLabelsService } from './services/labels-service.ts';
import { SqliteMessagesService } from './services/messages-service.ts';
import { MigrationServiceImpl } from './services/migration-service.ts';
import { createNewsService } from './services/news-service.ts';
import { createObservabilityRuntime } from './services/observability-runtime.ts';
import { createPerformWipe } from './services/perform-wipe.ts';
import { createPermissionsService } from './services/permissions-service.ts';
import { createPlatformService } from './services/platform-service.ts';
import { createPreferencesService } from './services/preferences-service.ts';
import { PreferencesStore } from './services/preferences-store.ts';
import { createProjectsService } from './services/projects-service.ts';
import { resolveIconPath, resolveRendererTargets } from './services/renderer-paths.ts';
import { SessionsCleanupScheduler } from './services/sessions-cleanup-scheduler.ts';
import { createSessionsService } from './services/sessions-service.ts';
import { registerShutdownHandlers } from './services/shutdown-bootstrap.ts';
import { createMountRegistry } from './services/sources/mount-bootstrap.ts';
import { createSourcesService } from './services/sources-service.ts';
import { TitleGeneratorService } from './services/title-generator.ts';
import { buildIntentUpdater, buildToolCatalog } from './services/tools-bootstrap.ts';
import { TranscriptionService } from './services/transcription.ts';
import { TurnDispatcher } from './services/turn-dispatcher.ts';
import { createUpdatesRuntime } from './services/updates-bootstrap.ts';
import { createWindowsService } from './services/windows-service.ts';
import { createWorkspaceTransferService } from './services/workspace-transfer-service.ts';
import { createWorkspacesService } from './services/workspaces-service.ts';
import { registerStartupCrashHandlers } from './startup-crash-log.ts';
import { StartupPreflightService } from './startup-preflight-service.ts';
import { createTrayService } from './tray-service.ts';
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

  // .env loading ANTES de app.whenReady(): Sentry exige init pré-ready.
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  if (!electron.app.isPackaged) {
    const { env: dotEnv } = loadSupabaseEnvFiles(rootDir);
    for (const [k, v] of Object.entries(dotEnv)) {
      // biome-ignore lint/style/noProcessEnv: composition root; seed único do .env
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }

  const observability = await createObservabilityRuntime({
    serviceName: '@g4os/desktop',
    serviceVersion: electron.app.getVersion(),
    environment: electron.app.isPackaged ? 'production' : 'development',
  });

  await electron.app.whenReady();

  const preflight = new StartupPreflightService();
  const preflightReport = await preflight.run({
    isPackaged: electron.app.isPackaged,
    rootDir,
    appVersion: electron.app.getVersion(),
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
  const hudPreloadPath = defaults.hudPreloadPath;
  const hudRendererUrl = defaults.hudRendererUrl;

  const lifecycle = new AppLifecycle(electron.app);
  const cpuPool = new CpuPool();
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
  let database: Awaited<ReturnType<typeof initDatabase>>;
  try {
    database = await initDatabase({
      filename: join(appPaths.data, 'app.db'),
      migrationsFolder,
    });
  } catch (error) {
    // Migration fail antes era thrown silencioso — user
    // ficava em loading screen sem feedback. Agora mostra dialog nativo
    // com path do backup pré-migration (preservado pelo `db-service`)
    // e instrução para support, então quit explicitly. UI rica via
    // RepairScreen requer renderer ativo, que não temos aqui.
    log.error({ err: error, dbPath: join(appPaths.data, 'app.db') }, 'database init failed');
    const message =
      error instanceof Error ? error.message : 'unexpected error during database initialization';
    const backupHint = `Backup pré-migration preservado em: ${join(appPaths.data, 'backups/')}`;
    if (electron.dialog) {
      electron.dialog.showErrorBox(
        'G4 OS — Falha na inicialização do banco de dados',
        `${message}\n\n${backupHint}\n\nReinstalar não vai resolver — contate o suporte com o ZIP de debug (Settings → Repair antes de reinstalar).`,
      );
    }
    electron.app.exit(1);
    return;
  }
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
    // refresh() não pode propagar pra cima — se falhar (vault locked,
    // env reread errado), o caller é o mutex de credentials e a falha
    // corromperia o estado. Best-effort: log e segue. Próxima mutation reage.
    onMutation: async (key) => {
      if (providerForVaultKey(key) === null) return;
      try {
        await agentsRuntime.refresh();
      } catch (err) {
        log.warn({ err, key }, 'agentsRuntime.refresh failed after credential mutation');
      }
    },
  });

  const sessionsRepo = new SessionsRepository(database.drizzle);

  const sourcesStore = new SourcesStore({
    resolveWorkspaceRoot: (id) => appPaths.workspace(id),
  });
  const sourcesService = createSourcesService({ store: sourcesStore, vault: credentialVault });

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

  // TitleGenerator checa session.name contra defaultNames antes de gerar — não sobrescreve nomes manuais.
  const titleGenerator = new TitleGeneratorService({
    vault: credentialVault,
    sessionsRepo,
    defaultNames: ['Nova sessão', 'New session'],
  });

  const turnDispatcher = new TurnDispatcher({
    messages: messagesService,
    registry: agentsRuntime.registry,
    eventBus: sessionEventBus,
    permissionBroker,
    toolCatalog,
    sourcesStore,
    credentialVault,
    mountRegistry,
    titleGenerator,
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

  // BackupScheduler — 24h interval, retenção 7/4/3 (ADR-0045).
  const backupScheduler = createBackupScheduler({
    drizzle: database.drizzle,
    appVersion: electron.app.getVersion(),
  });
  backupScheduler.start();

  // Limpa `.tmp` órfãos deixados por crashes do `truncateAfter` JSONL.
  // Best-effort, async em background — boot continua.
  scheduleOrphanTmpCleanup(database.drizzle, log);

  // PreferencesStore + Debug HUD reativo.
  // Default: dev=true (HUD aparece direto), prod=false (user habilita em
  // Settings > Modo de Reparo). Persiste em <appPaths.config>/preferences.json.
  const preferencesStore = new PreferencesStore({
    defaultDebugHudEnabled: !electron.app.isPackaged,
  });
  const initialHudEnabled = await preferencesStore.getDebugHudEnabled();
  let debugHud: DebugHudRuntime | null = null;
  try {
    debugHud = await createDebugHudRuntime({
      preloadPath: hudPreloadPath,
      rendererUrl: hudRendererUrl,
      initialEnabled: initialHudEnabled,
      listenerDetector: observability.listenerDetector,
      activeTurnsProvider: turnDispatcher,
    });
    log.info({ initialHudEnabled }, 'debug HUD runtime ready');
  } catch (cause) {
    log.warn({ err: cause }, 'failed to start debug HUD runtime');
  }

  // Liga o middleware tRPC `withMetrics` ao registry
  // singleton em `@g4os/observability/ipc`. Aggregator do HUD lê 1Hz.
  // Sem subscriber, registry só acumula sem custo extra.
  setIpcMetricsRecorder((sample) => ipcMetrics.record(sample));

  // Wire UpdateService. Em packaged usa electron-updater real;
  // em dev/E2E vira no-op (sem listener leak, sem crash).
  const updatesRuntime = await createUpdatesRuntime({
    disabled: !electron.app.isPackaged,
  });

  // Wire TranscriptionService. OpenAI primary, managed fallback.
  // managedEndpoint vazio em dev → fallback degrade to "no provider"
  // (erro tipado), exatamente o desejado quando user não tem nenhuma key.
  const transcriptionService = new TranscriptionService({
    getOpenAIKey: async () => {
      const r = await credentialVault.get('openai_api_key');
      return r.isOk() ? r.value : null;
    },
    getManagedToken: async () => {
      const r = await credentialVault.get('auth.access-token');
      return r.isOk() ? r.value : null;
    },
    managedEndpoint: readRuntimeEnv('G4OS_MANAGED_API_BASE') ?? '',
  });

  const performWipe = createPerformWipe({
    app: electron.app,
    workspaces: workspacesService,
    vault: credentialVault,
  });
  const authRuntime = createAuthRuntime({
    rootDir,
    skipDotEnv: electron.app.isPackaged,
    // biome-ignore lint/style/noProcessEnv: composition root; reads sanctioned here
    envSource: process.env,
    credentialVault,
    mockAuthMode: isE2E,
    performWipe,
  });

  if (!authRuntime.configured) {
    log.warn({ missingEnv: authRuntime.missingEnv }, 'supabase auth not configured');
  }

  registerShutdownHandlers(lifecycle, {
    mountRegistry,
    turnDispatcher,
    sessionEventBus,
    cpuPool,
    authRuntime,
    sessionsCleanup,
    backupScheduler,
    titleGenerator,
    newsService,
    database,
    observability,
    updates: updatesRuntime,
  });
  if (debugHud) lifecycle.onQuit(() => debugHud?.dispose());
  lifecycle.onAllWindowsClosed(() => {
    if (!isMacOS()) electron.app.quit();
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
      updates: updatesRuntime.service,
      voice: transcriptionService,
      preferences: createPreferencesService({
        store: preferencesStore,
        debugHud,
        isPackaged: electron.app.isPackaged,
        appVersion: electron.app.getVersion(),
      }),
      migration: new MigrationServiceImpl({
        drizzle: database.drizzle,
        sessionsRepo,
        sourcesStore,
        vault: credentialVault,
        resolveWorkspaceRoot: (id: string) => appPaths.workspace(id),
      }),
    },
  });
  await windowManager.load(mainWindow, { url: rendererUrl, openDevTools: isDev });

  // Atalhos globais. Carregamos `globalShortcut` lazy via
  // dynamic import — runtime do `loadElectron()` é minimalista e não
  // expõe globalShortcut no shape ElectronRuntime (mantém runtime mock testável).
  const electronModule = await import('electron').catch(() => null);
  if (electronModule?.globalShortcut) {
    const shortcuts = registerGlobalShortcuts({
      globalShortcut: electronModule.globalShortcut,
      getMainWindow: () => mainWindow,
    });
    lifecycle.onQuit(() => {
      shortcuts.dispose();
      return Promise.resolve();
    });
  }

  // Tray icon + system menu. Mesma estratégia: dynamic import pra evitar
  // acoplar runtime mock. Sem icon resolvido, tray service retorna null.
  if (electronModule?.Tray && electronModule?.Menu) {
    const tray = createTrayService({
      Tray: electronModule.Tray as never,
      Menu: electronModule.Menu as never,
      app: electronModule.app,
      iconPath,
      getMainWindow: () => mainWindow,
      onNewTurn: () => {
        const wc = (mainWindow as { webContents?: { send?: (ch: string) => void } }).webContents;
        wc?.send?.('global:new-turn');
      },
    });
    if (tray) {
      lifecycle.onQuit(() => {
        tray.dispose();
        return Promise.resolve();
      });
    }
  }

  log.info({ preloadPath, rendererUrl }, 'main ready');
}

registerStartupCrashHandlers(bootstrapMain());
