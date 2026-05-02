import type {
  AgentsService,
  AuthService,
  BackupService,
  CredentialsService,
  IpcSession,
  LabelsService,
  MarketplaceService,
  MessagesService,
  NewsService,
  PermissionsService,
  PlatformService,
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
} from './context-services.ts';
import type { MigrationService } from './migration-types.ts';

/**
 * Tipo estrutural para o IpcMainInvokeEvent do Electron.
 * Não importamos 'electron' aqui para manter o @g4os/ipc neutro quanto ao
 * processo; os tipos reais do Electron são conectados em apps/desktop/src/main.
 */
export interface IpcInvokeEventLike {
  readonly sender: { readonly id: number };
  readonly senderFrame: { readonly url: string } | null;
}

export type {
  AgentRuntimeStatus,
  AgentsService,
  AppInfo,
  AuthService,
  BackupEntry,
  BackupRunResult,
  BackupService,
  BranchSessionInput,
  CredentialMetaView,
  CredentialSetOptions,
  CredentialsService,
  FileDialogFilter,
  IpcSession,
  LabelsService,
  LegacyImportEntry,
  LegacyProject,
  MarketplaceService,
  MessagesService,
  NewsService,
  OpenDialogOptions,
  OpenDialogResult,
  PermissionDecisionInput,
  PermissionDecisionView,
  PermissionsService,
  PlatformService,
  PreferencesService,
  ProjectFile,
  ProjectsService,
  RuntimeIntegrityFailure,
  RuntimeIntegrityReport,
  SaveDialogOptions,
  SaveDialogResult,
  SchedulerService,
  SessionListPage,
  SessionsService,
  SourcesService,
  UpdatesService,
  VoiceService,
  WindowsService,
  WorkspaceDeleteOptions,
  WorkspaceExportSummary,
  WorkspaceImportSummary,
  WorkspaceSetupNeeds,
  WorkspacesService,
  WorkspaceTransferService,
} from './context-services.ts';

export type {
  MigrationExecuteInputView,
  MigrationPlanView,
  MigrationReportView,
  MigrationService,
  MigrationStepKindView,
  MigrationStepReportView,
  MigrationStepView,
  V1FlavorView,
  V1InstallView,
} from './migration-types.ts';

/**
 * Contexto compartilhado por todas as procedures tRPC.
 *
 * **Optionality:**
 * - `event?` é null em contextos headless/web (caller direto, não via
 *   `electron-trpc`). Procedures que precisam de `BrowserWindow` devem
 *   verificar e falhar com `TRPCError({ code: 'PRECONDITION_FAILED' })`.
 * - `session?` é null em chamadas pré-auth (login flow). Procedures que
 *   exigem usuário autenticado devem usar o middleware `authed` que
 *   valida e estreita o tipo.
 * - `platform?` é conditionally-available — depende do flavor do build.
 *   Em web/headless é null. Procedures de file-system / abrir browser
 *   devem lançar TRPCError se ausente (ver `platform-router`).
 * - **Todos os outros services** (`workspaces`, `sessions`, ..., `labels`)
 *   são always-on no main process. Tipo obrigatório, sem `?`.
 */
export interface IpcContext {
  /** Electron IPC event handle. Null fora de Electron (web/headless/tests). */
  readonly event?: IpcInvokeEventLike;
  /** Sempre presente. Trace ID propagado via OTel para o request inteiro. */
  readonly traceId: string;
  /**
   * W3C traceparent injetado pelo renderer via `tracing-link`. Null em
   * callers diretos (testes, headless). Middleware de telemetria usa
   * `propagation.extract` para fazer o span do main como filho do span
   * do renderer.
   */
  readonly traceparent?: string;
  /** Null em rotas pré-auth (login). `authed` middleware estreita pra obrigatório. */
  readonly session?: IpcSession;

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
  /** Null em web/headless. Procedures que precisam devem lançar TRPCError. */
  readonly platform?: PlatformService;
  readonly windows: WindowsService;
  readonly workspaceTransfer: WorkspaceTransferService;
  readonly labels: LabelsService;
  readonly preferences: PreferencesService;
  readonly migration: MigrationService;
  readonly backup: BackupService;
  /**
   * Probe ativo dos endpoints de observability (Sentry/OTel/metrics). Faz
   * HTTP HEAD com timeout — `configured` reflete env var, `reachable`
   * reflete conectividade real.
   */
  readonly servicesStatus: () => Promise<ServicesStatusMap>;
}

export interface ServiceStatus {
  readonly configured: boolean;
  readonly reachable: boolean | null;
  readonly latencyMs: number | null;
  readonly error: string | null;
  readonly endpoint: string | null;
}

export interface ServicesStatusMap {
  readonly sentry: ServiceStatus;
  readonly otel: ServiceStatus;
  readonly metricsServer: ServiceStatus;
}
