import {
  type AgentsService,
  type AuthService,
  type CredentialsService,
  createNullServices,
  type IpcContext,
  type IpcInvokeEventLike,
  type LabelsService,
  type MarketplaceService,
  type MessagesService,
  type NewsService,
  type PermissionsService,
  type PlatformService,
  type ProjectsService,
  type SchedulerService,
  type SessionsService,
  type SourcesService,
  type UpdatesService,
  type VoiceService,
  type WindowsService,
  type WorkspacesService,
  type WorkspaceTransferService,
} from '@g4os/ipc/server';

export interface CreateContextInput {
  readonly event?: IpcInvokeEventLike;
  readonly services?: IpcServiceOverrides;
}

export interface IpcServiceOverrides {
  readonly workspaces?: WorkspacesService;
  readonly sessions?: SessionsService;
  readonly messages?: MessagesService;
  readonly projects?: ProjectsService;
  readonly credentials?: CredentialsService;
  readonly permissions?: PermissionsService;
  readonly sources?: SourcesService;
  readonly agents?: AgentsService;
  readonly auth?: AuthService;
  readonly marketplace?: MarketplaceService;
  readonly news?: NewsService;
  readonly scheduler?: SchedulerService;
  readonly updates?: UpdatesService;
  readonly voice?: VoiceService;
  readonly windows?: WindowsService;
  readonly workspaceTransfer?: WorkspaceTransferService;
  readonly labels?: LabelsService;
  readonly platform?: PlatformService;
}

export async function createContext(input: CreateContextInput = {}): Promise<IpcContext> {
  const nulls = createNullServices();
  const services = {
    workspaces: input.services?.workspaces ?? nulls.workspaces,
    sessions: input.services?.sessions ?? nulls.sessions,
    messages: input.services?.messages ?? nulls.messages,
    projects: input.services?.projects ?? nulls.projects,
    credentials: input.services?.credentials ?? nulls.credentials,
    permissions: input.services?.permissions ?? nulls.permissions,
    sources: input.services?.sources ?? nulls.sources,
    agents: input.services?.agents ?? nulls.agents,
    auth: input.services?.auth ?? nulls.auth,
    marketplace: input.services?.marketplace ?? nulls.marketplace,
    news: input.services?.news ?? nulls.news,
    scheduler: input.services?.scheduler ?? nulls.scheduler,
    updates: input.services?.updates ?? nulls.updates,
    voice: input.services?.voice ?? nulls.voice,
    windows: input.services?.windows ?? nulls.windows,
    workspaceTransfer: input.services?.workspaceTransfer ?? nulls.workspaceTransfer,
    labels: input.services?.labels ?? nulls.labels,
    ...(input.services?.platform ? { platform: input.services.platform } : {}),
  };

  const sessionResult = await services.auth.getMe();

  return {
    ...(input.event ? { event: input.event } : {}),
    ...(sessionResult.isOk() ? { session: sessionResult.value } : {}),
    traceId: `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    ...services,
  };
}
