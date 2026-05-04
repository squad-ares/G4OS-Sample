import type { IDisposable } from '@g4os/kernel/disposable';
import { toDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';
import type {
  AgentsService,
  AuthService,
  CredentialsService,
  IpcContext,
  LabelsService,
  MarketplaceService,
  MessagesService,
  NewsService,
  PermissionsService,
  PreferencesService,
  ProjectsService,
  SchedulerService,
  SessionsService,
  SourcesService,
  UpdatesService,
  VoiceService,
  WindowsService,
  WorkspacesService,
  WorkspaceTransferService,
} from '../../context.ts';
import { appRouter } from '../../root-router.ts';

const notImplemented = (op: string): AppError =>
  new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: `[test-mock] ${op} not implemented`,
  });

function createWorkspacesMock(): WorkspacesService {
  return {
    list: async () => ok([]),
    get: async () => err(notImplemented('workspaces.get')),
    create: async (input) =>
      ok({
        id: '11111111-1111-4111-8111-111111111111' as const,
        name: input.name,
        slug: input.name.toLowerCase().replace(/\s+/g, '-'),
        rootPath: input.rootPath,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        defaults: { permissionMode: 'ask' as const },
        setupCompleted: false,
        styleSetupCompleted: false,
        metadata: {},
      }),
    update: async () => ok(undefined),
    delete: async () => ok(undefined),
    getSetupNeeds: async () =>
      ok({ needsInitialSetup: false, needsStyleSetup: false, isFullyConfigured: true }),
  };
}

function createSessionsMock(): SessionsService {
  return {
    list: async () => ok([]),
    listFiltered: async () => ok({ items: [], total: 0, hasMore: false }),
    get: async () => err(notImplemented('sessions.get')),
    create: async () => err(notImplemented('sessions.create')),
    update: async () => ok(undefined),
    delete: async () => ok(undefined),
    subscribe: (_id, _handler): IDisposable =>
      toDisposable(() => {
        /* no-op: mock disposable */
      }),
    subscribeStream: (_id, _handler): IDisposable =>
      toDisposable(() => {
        /* no-op: mock disposable */
      }),
    sendMessage: async () => ok(undefined),
    runtimeStatus: async () => ok({ available: false, providers: [] } as const),
    respondPermission: async () => ok(undefined),
    stopTurn: async () => ok(undefined),
    retryLastTurn: async () => ok(undefined),
    truncateAfter: async () => ok({ removed: 0 }),
    archive: async () => ok(undefined),
    restore: async () => ok(undefined),
    pin: async () => ok(undefined),
    unpin: async () => ok(undefined),
    star: async () => ok(undefined),
    unstar: async () => ok(undefined),
    markRead: async () => ok(undefined),
    markUnread: async () => ok(undefined),
    branch: async () => err(notImplemented('sessions.branch')),
    listBranches: async () => ok([]),
    setLabels: async () => ok(undefined),
    getLabels: async () => ok([]),
    globalSearch: async () => ok({ messages: [], sessions: [] }),
  };
}

function createLabelsMock(): LabelsService {
  return {
    list: async () => ok([]),
    create: async () => err(notImplemented('labels.create')),
    rename: async () => ok(undefined),
    recolor: async () => ok(undefined),
    reparent: async () => ok(undefined),
    delete: async () => ok(undefined),
  };
}

function createMessagesMock(): MessagesService {
  return {
    list: async () => ok([]),
    get: async () => err(notImplemented('messages.get')),
    append: async () => err(notImplemented('messages.append')),
    search: async () => ok([]),
  };
}

function createVoiceMock(): VoiceService {
  return {
    transcribe: async () => err(notImplemented('voice.transcribe')),
  };
}

function createWindowsMock(): WindowsService {
  return {
    openWorkspaceWindow: async () => ok(undefined),
  };
}

function createWorkspaceTransferMock(): WorkspaceTransferService {
  return {
    exportWorkspace: async () => err(notImplemented('workspaceTransfer.exportWorkspace')),
    importWorkspace: async () => err(notImplemented('workspaceTransfer.importWorkspace')),
  };
}

function createProjectsMock(): ProjectsService {
  return {
    list: async () => ok([]),
    listArchived: async () => ok([]),
    get: async () => err(notImplemented('projects.get')),
    create: async () => err(notImplemented('projects.create')),
    update: async () => err(notImplemented('projects.update')),
    archive: async () => err(notImplemented('projects.archive')),
    restore: async () => err(notImplemented('projects.restore')),
    delete: async () => err(notImplemented('projects.delete')),
    listFiles: async () => ok([]),
    getFileContent: async () => err(notImplemented('projects.getFileContent')),
    saveFile: async () => err(notImplemented('projects.saveFile')),
    deleteFile: async () => err(notImplemented('projects.deleteFile')),
    listTasks: async () => ok([]),
    createTask: async () => err(notImplemented('projects.createTask')),
    updateTask: async () => err(notImplemented('projects.updateTask')),
    deleteTask: async () => err(notImplemented('projects.deleteTask')),
    listSessions: async () => ok([]),
    hasLegacyImportDone: async () => ok(true),
    discoverLegacyProjects: async () => ok([]),
    importLegacyProjects: async () => ok([]),
  };
}

function createCredentialsMock(): CredentialsService {
  return {
    get: async () => err(notImplemented('credentials.get')),
    set: async () => ok(undefined),
    delete: async () => ok(undefined),
    list: async () => ok([]),
    rotate: async () => ok(undefined),
  };
}

function createPermissionsMock(): PermissionsService {
  return {
    list: async () => ok([]),
    revoke: async () => ok(undefined),
    clearAll: async () => ok({ removed: 0 }),
  };
}

function createSourcesMock(): SourcesService {
  return {
    list: async () => ok([]),
    listAvailable: async () => ok([]),
    get: async () => err(notImplemented('sources.get')),
    enableManaged: async () => err(notImplemented('sources.enableManaged')),
    createStdio: async () => err(notImplemented('sources.createStdio')),
    createHttp: async () => err(notImplemented('sources.createHttp')),
    setEnabled: async () => err(notImplemented('sources.setEnabled')),
    delete: async () => ok(undefined),
    testConnection: async () => err(notImplemented('sources.testConnection')),
  };
}

function createAgentsMock(): AgentsService {
  return { list: async () => ok([]) };
}

function createAuthMock(): AuthService {
  return {
    getMe: async () => err(notImplemented('auth.getMe')),
    sendOtp: async () => ok(undefined),
    verifyOtp: async () => err(notImplemented('auth.verifyOtp')),
    signOut: async () => ok(undefined),
    wipeAndReset: async () => ok(undefined),
    subscribeManagedLoginRequired: () => ({ dispose: () => undefined }),
  };
}

function createMarketplaceMock(): MarketplaceService {
  return { list: async () => ok([]) };
}

function createNewsMock(): NewsService {
  return {
    list: async () => ok([]),
    get: async () => ok(null),
  };
}

function createSchedulerMock(): SchedulerService {
  return { list: async () => ok([]) };
}

function createUpdatesMock(): UpdatesService {
  return { check: async () => ok({ hasUpdate: false }) };
}

function createPreferencesMock(): PreferencesService {
  let enabled = false;
  return {
    getDebugHudEnabled: async () => ok(enabled),
    setDebugHudEnabled: (next: boolean) => {
      enabled = next;
      return Promise.resolve(ok(undefined));
    },
    verifyRuntimeIntegrity: async () =>
      ok({
        ok: true,
        metaPresent: false,
        failures: [],
        checkedRuntimes: 0,
      }),
  };
}

export function createTestCaller(
  overrides: Partial<IpcContext> = {},
): ReturnType<typeof appRouter.createCaller> {
  const ctx: IpcContext = {
    traceId: 'test-trace',
    session: { userId: 'test-user', email: 'test@example.com' },
    workspaces: createWorkspacesMock(),
    sessions: createSessionsMock(),
    messages: createMessagesMock(),
    projects: createProjectsMock(),
    credentials: createCredentialsMock(),
    permissions: createPermissionsMock(),
    sources: createSourcesMock(),
    agents: createAgentsMock(),
    auth: createAuthMock(),
    marketplace: createMarketplaceMock(),
    news: createNewsMock(),
    scheduler: createSchedulerMock(),
    updates: createUpdatesMock(),
    voice: createVoiceMock(),
    windows: createWindowsMock(),
    workspaceTransfer: createWorkspaceTransferMock(),
    labels: createLabelsMock(),
    preferences: createPreferencesMock(),
    migration: {
      detect: async () => ok(null),
      plan: async () =>
        err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'migration.plan stub' })),
      execute: async () =>
        err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'migration.execute stub' })),
    },
    backup: {
      list: async () => ok([]),
      runNow: async () =>
        err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'backup.runNow stub' })),
      delete: async () =>
        err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'backup.delete stub' })),
    },
    servicesStatus: () => {
      const noop = {
        configured: false,
        reachable: null,
        latencyMs: null,
        error: null,
        endpoint: null,
      } as const;
      return Promise.resolve({ sentry: noop, otel: noop, metricsServer: noop });
    },
    ...overrides,
  };
  return appRouter.createCaller(ctx);
}
