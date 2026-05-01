import type { IDisposable } from '@g4os/kernel/disposable';
import type { AppError, Result } from '@g4os/kernel/errors';
import type {
  CreateMcpHttpSourceInput,
  CreateMcpStdioSourceInput,
  EnableManagedSourceInput,
  GlobalSearchResult,
  Label,
  LabelCreateInput,
  LabelId,
  LegacyImportEntry,
  LegacyProject,
  Message,
  MessageAppendResult,
  MessageId,
  NewsItem,
  Project,
  ProjectCreateInput,
  ProjectFile,
  ProjectId,
  ProjectPatch,
  ProjectTask,
  ProjectTaskCreateInput,
  ProjectTaskId,
  ProjectTaskPatch,
  SearchMatch,
  Session,
  SessionEvent,
  SessionFilter,
  SessionId,
  SourceCatalogItem,
  SourceConfigView,
  SourceId,
  SourceStatus,
  TurnStreamEvent,
  Workspace,
  WorkspaceId,
} from '@g4os/kernel/types';
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

export interface IpcSession {
  readonly userId: string;
  readonly email: string;
  readonly expiresAt?: number;
}

export interface WorkspaceDeleteOptions {
  readonly removeFiles?: boolean;
}

export interface WorkspaceSetupNeeds {
  /** `setupCompleted=false` → primeiro turn deve ser "/setup". */
  readonly needsInitialSetup: boolean;
  /** `setupCompleted=true && styleSetupCompleted=false` → segundo turn deve ser style interview. */
  readonly needsStyleSetup: boolean;
  /** Estado consolidado: `true` quando ambos os flags são `true`. */
  readonly isFullyConfigured: boolean;
}

export interface WorkspacesService {
  list(): Promise<Result<readonly Workspace[], AppError>>;
  get(id: WorkspaceId): Promise<Result<Workspace, AppError>>;
  create(input: Pick<Workspace, 'name' | 'rootPath'>): Promise<Result<Workspace, AppError>>;
  update(id: WorkspaceId, patch: Partial<Workspace>): Promise<Result<void, AppError>>;
  delete(id: WorkspaceId, options?: WorkspaceDeleteOptions): Promise<Result<void, AppError>>;
  getSetupNeeds(id: WorkspaceId): Promise<Result<WorkspaceSetupNeeds, AppError>>;
}

export interface SessionListPage {
  readonly items: readonly Session[];
  readonly total: number;
  readonly hasMore: boolean;
}

export interface BranchSessionInput {
  readonly sourceId: SessionId;
  readonly atSequence: number;
  readonly name?: string;
}

export type PermissionDecisionInput = 'allow_once' | 'allow_session' | 'allow_always' | 'deny';

export interface SessionsService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly Session[], AppError>>;
  listFiltered(filter: SessionFilter): Promise<Result<SessionListPage, AppError>>;
  get(id: SessionId): Promise<Result<Session, AppError>>;
  create(input: Pick<Session, 'workspaceId' | 'name'>): Promise<Result<Session, AppError>>;
  update(id: SessionId, patch: Partial<Session>): Promise<Result<void, AppError>>;
  delete(id: SessionId): Promise<Result<void, AppError>>;
  subscribe(id: SessionId, handler: (event: SessionEvent) => void): IDisposable;
  subscribeStream(id: SessionId, handler: (event: TurnStreamEvent) => void): IDisposable;
  sendMessage(id: SessionId, text: string): Promise<Result<void, AppError>>;
  stopTurn(id: SessionId): Promise<Result<void, AppError>>;
  retryLastTurn(id: SessionId): Promise<Result<void, AppError>>;
  runtimeStatus(): Promise<Result<AgentRuntimeStatus, AppError>>;
  respondPermission(
    requestId: string,
    decision: PermissionDecisionInput,
  ): Promise<Result<void, AppError>>;
  truncateAfter(
    id: SessionId,
    afterSequence: number,
  ): Promise<Result<{ removed: number }, AppError>>;

  archive(id: SessionId): Promise<Result<void, AppError>>;
  restore(id: SessionId): Promise<Result<void, AppError>>;
  pin(id: SessionId): Promise<Result<void, AppError>>;
  unpin(id: SessionId): Promise<Result<void, AppError>>;
  star(id: SessionId): Promise<Result<void, AppError>>;
  unstar(id: SessionId): Promise<Result<void, AppError>>;
  markRead(id: SessionId): Promise<Result<void, AppError>>;
  markUnread(id: SessionId): Promise<Result<void, AppError>>;

  branch(input: BranchSessionInput): Promise<Result<Session, AppError>>;
  listBranches(parentId: SessionId): Promise<Result<readonly Session[], AppError>>;

  setLabels(id: SessionId, labelIds: readonly LabelId[]): Promise<Result<void, AppError>>;
  getLabels(id: SessionId): Promise<Result<readonly LabelId[], AppError>>;

  globalSearch(
    workspaceId: WorkspaceId,
    query: string,
  ): Promise<Result<GlobalSearchResult, AppError>>;
}

export interface LabelsService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly Label[], AppError>>;
  create(input: LabelCreateInput): Promise<Result<Label, AppError>>;
  rename(id: LabelId, name: string): Promise<Result<void, AppError>>;
  recolor(id: LabelId, color: string | null): Promise<Result<void, AppError>>;
  reparent(id: LabelId, newParentId: LabelId | null): Promise<Result<void, AppError>>;
  delete(id: LabelId): Promise<Result<void, AppError>>;
}

export interface MessagesService {
  list(sessionId: SessionId): Promise<Result<readonly Message[], AppError>>;
  get(id: MessageId): Promise<Result<Message, AppError>>;
  append(
    input: Pick<Message, 'sessionId' | 'role' | 'content'>,
  ): Promise<Result<MessageAppendResult, AppError>>;
  search(sessionId: SessionId, query: string): Promise<Result<readonly SearchMatch[], AppError>>;
}

export interface AgentRuntimeStatus {
  readonly available: boolean;
  readonly providers: readonly string[];
}

export type { LegacyImportEntry, LegacyProject, ProjectFile };

export interface ProjectsService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly Project[], AppError>>;
  listArchived(workspaceId: WorkspaceId): Promise<Result<readonly Project[], AppError>>;
  get(id: ProjectId): Promise<Result<Project, AppError>>;
  create(input: ProjectCreateInput): Promise<Result<Project, AppError>>;
  update(id: ProjectId, patch: ProjectPatch): Promise<Result<void, AppError>>;
  archive(id: ProjectId): Promise<Result<void, AppError>>;
  restore(id: ProjectId): Promise<Result<void, AppError>>;
  delete(id: ProjectId): Promise<Result<void, AppError>>;

  listFiles(projectId: ProjectId): Promise<Result<readonly ProjectFile[], AppError>>;
  getFileContent(projectId: ProjectId, relativePath: string): Promise<Result<string, AppError>>;
  saveFile(
    projectId: ProjectId,
    relativePath: string,
    content: string,
  ): Promise<Result<void, AppError>>;
  deleteFile(projectId: ProjectId, relativePath: string): Promise<Result<void, AppError>>;

  listTasks(projectId: ProjectId): Promise<Result<readonly ProjectTask[], AppError>>;
  createTask(input: ProjectTaskCreateInput): Promise<Result<ProjectTask, AppError>>;
  updateTask(id: ProjectTaskId, patch: ProjectTaskPatch): Promise<Result<void, AppError>>;
  deleteTask(id: ProjectTaskId): Promise<Result<void, AppError>>;

  listSessions(projectId: ProjectId): Promise<Result<readonly Session[], AppError>>;

  hasLegacyImportDone(workspaceId: WorkspaceId): Promise<Result<boolean, AppError>>;
  discoverLegacyProjects(
    workspaceId: WorkspaceId,
    workingDirectory: string,
  ): Promise<Result<readonly LegacyProject[], AppError>>;
  importLegacyProjects(
    workspaceId: WorkspaceId,
    entries: readonly LegacyImportEntry[],
  ): Promise<Result<readonly Project[], AppError>>;
}

export interface CredentialMetaView {
  readonly key: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt?: number;
  readonly tags: readonly string[];
}

export interface CredentialSetOptions {
  readonly expiresAt?: number;
  readonly tags?: readonly string[];
}

export interface PermissionDecisionView {
  readonly toolName: string;
  readonly argsHash: string;
  readonly argsPreview: string;
  readonly decidedAt: number;
}

export interface PermissionsService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly PermissionDecisionView[], AppError>>;
  revoke(
    workspaceId: WorkspaceId,
    toolName: string,
    argsHash: string,
  ): Promise<Result<void, AppError>>;
  clearAll(workspaceId: WorkspaceId): Promise<Result<{ removed: number }, AppError>>;
}

export interface CredentialsService {
  get(key: string): Promise<Result<string, AppError>>;
  set(key: string, value: string, options?: CredentialSetOptions): Promise<Result<void, AppError>>;
  delete(key: string): Promise<Result<void, AppError>>;
  list(): Promise<Result<readonly CredentialMetaView[], AppError>>;
  rotate(key: string, newValue: string): Promise<Result<void, AppError>>;
}

export interface SourcesService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly SourceConfigView[], AppError>>;
  listAvailable(workspaceId: WorkspaceId): Promise<Result<readonly SourceCatalogItem[], AppError>>;
  get(workspaceId: WorkspaceId, id: SourceId): Promise<Result<SourceConfigView, AppError>>;
  enableManaged(input: EnableManagedSourceInput): Promise<Result<SourceConfigView, AppError>>;
  createStdio(input: CreateMcpStdioSourceInput): Promise<Result<SourceConfigView, AppError>>;
  createHttp(input: CreateMcpHttpSourceInput): Promise<Result<SourceConfigView, AppError>>;
  setEnabled(
    workspaceId: WorkspaceId,
    id: SourceId,
    enabled: boolean,
  ): Promise<Result<SourceConfigView, AppError>>;
  delete(workspaceId: WorkspaceId, id: SourceId): Promise<Result<void, AppError>>;
  testConnection(workspaceId: WorkspaceId, id: SourceId): Promise<Result<SourceStatus, AppError>>;
}

export interface AgentsService {
  list(): Promise<Result<readonly unknown[], AppError>>;
}

export interface AuthService {
  getMe(): Promise<Result<IpcSession, AppError>>;
  sendOtp(email: string): Promise<Result<void, AppError>>;
  verifyOtp(email: string, code: string): Promise<Result<IpcSession, AppError>>;
  signOut(): Promise<Result<void, AppError>>;
  /**
   * Reset destrutivo: revoga sessão, apaga workspaces, credenciais e dados de
   * preferência. Implementação owns the order — falhas parciais devem retornar
   * `Result.err`. Após sucesso, o cliente deve invalidar a query de auth e
   * navegar para `/login`. Uso esperado: feature `ResetConfirmationDialog`.
   */
  wipeAndReset(): Promise<Result<void, AppError>>;
  /**
   * Subscription para o backend pedir re-autenticação (ex.: token revogado
   * fora do app). Renderer mostra toast com action `Sign in` ou navega para
   * `/login?reauth=1`. Não recebemos sessão — só o sinal.
   */
  subscribeManagedLoginRequired(handler: (event: { reason: string }) => void): IDisposable;
}

export interface MarketplaceService {
  list(): Promise<Result<readonly unknown[], AppError>>;
}

export interface NewsService {
  list(): Promise<Result<readonly NewsItem[], AppError>>;
  get(id: string): Promise<Result<NewsItem | null, AppError>>;
}

export interface SchedulerService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly unknown[], AppError>>;
}

export interface UpdatesService {
  check(): Promise<Result<{ hasUpdate: boolean; version?: string }, AppError>>;
}

export interface FileDialogFilter {
  readonly name: string;
  readonly extensions: readonly string[];
}

export interface SaveDialogOptions {
  readonly defaultPath?: string;
  readonly filters?: readonly FileDialogFilter[];
  readonly title?: string;
}

export interface OpenDialogOptions {
  readonly filters?: readonly FileDialogFilter[];
  readonly title?: string;
  readonly defaultPath?: string;
}

export interface SaveDialogResult {
  readonly canceled: boolean;
  readonly filePath?: string;
}

export interface OpenDialogResult {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}

export interface AppInfo {
  readonly version: string;
  readonly platform: string;
  readonly isPackaged: boolean;
  readonly electronVersion: string;
  readonly nodeVersion: string;
}

export interface PlatformService {
  readFileAsDataUrl?(path: string): Promise<string>;
  openExternal?(url: string): Promise<void>;
  copyToClipboard?(text: string): Promise<void>;
  showItemInFolder?(path: string): Promise<void>;
  showSaveDialog?(options: SaveDialogOptions): Promise<SaveDialogResult>;
  showOpenDialog?(options: OpenDialogOptions): Promise<OpenDialogResult>;
  getAppInfo?(): AppInfo;
}

export interface VoiceService {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}

export interface WindowsService {
  openWorkspaceWindow(workspaceId: WorkspaceId): Promise<Result<void, AppError>>;
}

export interface WorkspaceExportSummary {
  readonly path: string;
  readonly sizeBytes: number;
  readonly filesIncluded: number;
}

export interface WorkspaceImportSummary {
  readonly workspaceId: WorkspaceId;
  readonly warnings: readonly string[];
}

export interface WorkspaceTransferService {
  exportWorkspace(input: {
    readonly workspaceId: WorkspaceId;
    readonly outputPath: string;
  }): Promise<Result<WorkspaceExportSummary, AppError>>;
  importWorkspace(input: {
    readonly zipPath: string;
  }): Promise<Result<WorkspaceImportSummary, AppError>>;
}

/**
 * Preferences globais do app (não ligadas a workspace ou login).
 *
 * Atualmente cobre só `debug.hud.enabled` e
 * `verifyRuntimeIntegrity`. Cresce conforme novas
 * preferences globais aparecem.
 */
export interface RuntimeIntegrityFailure {
  readonly code: string;
  readonly runtime?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface RuntimeIntegrityReport {
  readonly ok: boolean;
  readonly metaPresent: boolean;
  readonly metaPath?: string;
  readonly appVersion?: string;
  readonly flavor?: string;
  readonly target?: string;
  readonly builtAt?: string;
  readonly failures: readonly RuntimeIntegrityFailure[];
  readonly checkedRuntimes: number;
}

export interface PreferencesService {
  getDebugHudEnabled(): Promise<Result<boolean, AppError>>;
  setDebugHudEnabled(enabled: boolean): Promise<Result<void, AppError>>;
  /**
   * Roda `verifyRuntimeHashes` on-demand. Caro (10MB+
   * SHA-256 por runtime), portanto fica fora do boot. Útil em Repair
   * Mode quando suspeita-se de tamper / antivírus / disk corruption.
   */
  verifyRuntimeIntegrity(): Promise<Result<RuntimeIntegrityReport, AppError>>;
}

export type {
  MigrationPlanView,
  MigrationService,
  MigrationStepKindView,
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
}
