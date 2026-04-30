import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';
import type {
  AgentsService,
  AuthService,
  CredentialsService,
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
} from './context.ts';

function notImplemented(scope: string): AppError {
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: `Serviço ${scope} ainda não implementado neste scaffold`,
    context: { scope },
  });
}

export interface NullServices {
  readonly workspaces: WorkspacesService;
  readonly sessions: SessionsService;
  readonly messages: MessagesService;
  readonly projects: ProjectsService;
  readonly credentials: CredentialsService;
  readonly permissions: PermissionsService;
  readonly sources: SourcesService;
  readonly agents: AgentsService;
  readonly auth: AuthService;
  readonly marketplace: MarketplaceService;
  readonly news: NewsService;
  readonly scheduler: SchedulerService;
  readonly updates: UpdatesService;
  readonly voice: VoiceService;
  readonly windows: WindowsService;
  readonly workspaceTransfer: WorkspaceTransferService;
  readonly labels: LabelsService;
  readonly preferences: PreferencesService;
}

export function createNullServices(): NullServices {
  return {
    workspaces: {
      list: async () => err(notImplemented('workspaces.list')),
      get: async () => err(notImplemented('workspaces.get')),
      create: async () => err(notImplemented('workspaces.create')),
      update: async () => err(notImplemented('workspaces.update')),
      delete: async () => err(notImplemented('workspaces.delete')),
      getSetupNeeds: async () =>
        ok({ needsInitialSetup: false, needsStyleSetup: false, isFullyConfigured: true }),
    },
    sessions: {
      list: async () => err(notImplemented('sessions.list')),
      listFiltered: async () => err(notImplemented('sessions.listFiltered')),
      get: async () => err(notImplemented('sessions.get')),
      create: async () => err(notImplemented('sessions.create')),
      update: async () => err(notImplemented('sessions.update')),
      delete: async () => err(notImplemented('sessions.delete')),
      subscribe: () => ({ dispose: () => undefined }),
      subscribeStream: () => ({ dispose: () => undefined }),
      sendMessage: async () => err(notImplemented('sessions.sendMessage')),
      stopTurn: async () => err(notImplemented('sessions.stopTurn')),
      retryLastTurn: async () => err(notImplemented('sessions.retryLastTurn')),
      runtimeStatus: async () => ok({ available: false, providers: [] } as const),
      respondPermission: async () => err(notImplemented('sessions.respondPermission')),
      truncateAfter: async () => err(notImplemented('sessions.truncateAfter')),
      archive: async () => err(notImplemented('sessions.archive')),
      restore: async () => err(notImplemented('sessions.restore')),
      pin: async () => err(notImplemented('sessions.pin')),
      unpin: async () => err(notImplemented('sessions.unpin')),
      star: async () => err(notImplemented('sessions.star')),
      unstar: async () => err(notImplemented('sessions.unstar')),
      markRead: async () => err(notImplemented('sessions.markRead')),
      markUnread: async () => err(notImplemented('sessions.markUnread')),
      branch: async () => err(notImplemented('sessions.branch')),
      listBranches: async () => ok([]),
      setLabels: async () => err(notImplemented('sessions.setLabels')),
      getLabels: async () => ok([]),
      globalSearch: async () => ok({ messages: [], sessions: [] }),
    },
    messages: {
      list: async () => err(notImplemented('messages.list')),
      get: async () => err(notImplemented('messages.get')),
      append: async () => err(notImplemented('messages.append')),
      search: async () => ok([]),
    },
    projects: {
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
    },
    credentials: {
      get: async () => err(notImplemented('credentials.get')),
      set: async () => err(notImplemented('credentials.set')),
      delete: async () => err(notImplemented('credentials.delete')),
      list: async () => err(notImplemented('credentials.list')),
      rotate: async () => err(notImplemented('credentials.rotate')),
    },
    permissions: {
      list: async () => err(notImplemented('permissions.list')),
      revoke: async () => err(notImplemented('permissions.revoke')),
      clearAll: async () => err(notImplemented('permissions.clearAll')),
    },
    sources: {
      list: async () => err(notImplemented('sources.list')),
      listAvailable: async () => err(notImplemented('sources.listAvailable')),
      get: async () => err(notImplemented('sources.get')),
      enableManaged: async () => err(notImplemented('sources.enableManaged')),
      createStdio: async () => err(notImplemented('sources.createStdio')),
      createHttp: async () => err(notImplemented('sources.createHttp')),
      setEnabled: async () => err(notImplemented('sources.setEnabled')),
      delete: async () => err(notImplemented('sources.delete')),
      testConnection: async () => err(notImplemented('sources.testConnection')),
    },
    agents: {
      list: async () => err(notImplemented('agents.list')),
    },
    auth: {
      getMe: async () => err(notImplemented('auth.getMe')),
      sendOtp: async () => err(notImplemented('auth.sendOtp')),
      verifyOtp: async () => err(notImplemented('auth.verifyOtp')),
      signOut: async () => ok(undefined),
      wipeAndReset: async () => err(notImplemented('auth.wipeAndReset')),
      subscribeManagedLoginRequired: () => ({ dispose: () => undefined }),
    },
    marketplace: {
      list: async () => err(notImplemented('marketplace.list')),
    },
    news: {
      list: async () => err(notImplemented('news.list')),
      get: async () => err(notImplemented('news.get')),
    },
    scheduler: {
      list: async () => err(notImplemented('scheduler.list')),
    },
    updates: {
      check: async () => err(notImplemented('updates.check')),
    },
    voice: {
      transcribe: () => Promise.reject(notImplemented('voice.transcribe')),
    },
    windows: {
      openWorkspaceWindow: async () => err(notImplemented('windows.openWorkspaceWindow')),
    },
    workspaceTransfer: {
      exportWorkspace: async () => err(notImplemented('workspaceTransfer.exportWorkspace')),
      importWorkspace: async () => err(notImplemented('workspaceTransfer.importWorkspace')),
    },
    labels: {
      list: async () => ok([]),
      create: async () => err(notImplemented('labels.create')),
      rename: async () => err(notImplemented('labels.rename')),
      recolor: async () => err(notImplemented('labels.recolor')),
      reparent: async () => err(notImplemented('labels.reparent')),
      delete: async () => err(notImplemented('labels.delete')),
    },
    preferences: {
      // Default sensato em scaffolds: HUD desligado (prod-like).
      getDebugHudEnabled: async () => ok(false),
      setDebugHudEnabled: async () => err(notImplemented('preferences.setDebugHudEnabled')),
      verifyRuntimeIntegrity: async () => err(notImplemented('preferences.verifyRuntimeIntegrity')),
    },
  };
}
