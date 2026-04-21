import type { IDisposable } from '@g4os/kernel/disposable';
import type { AppError, Result } from '@g4os/kernel/errors';
import type {
  Message,
  MessageId,
  Session,
  SessionEvent,
  SessionId,
  Workspace,
  WorkspaceId,
} from '@g4os/kernel/types';

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

export interface WorkspacesService {
  list(): Promise<Result<readonly Workspace[], AppError>>;
  get(id: WorkspaceId): Promise<Result<Workspace, AppError>>;
  create(input: Pick<Workspace, 'name' | 'rootPath'>): Promise<Result<Workspace, AppError>>;
  update(id: WorkspaceId, patch: Partial<Workspace>): Promise<Result<void, AppError>>;
  delete(id: WorkspaceId): Promise<Result<void, AppError>>;
}

export interface SessionsService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly Session[], AppError>>;
  get(id: SessionId): Promise<Result<Session, AppError>>;
  create(input: Pick<Session, 'workspaceId' | 'name'>): Promise<Result<Session, AppError>>;
  update(id: SessionId, patch: Partial<Session>): Promise<Result<void, AppError>>;
  delete(id: SessionId): Promise<Result<void, AppError>>;
  subscribe(id: SessionId, handler: (event: SessionEvent) => void): IDisposable;
}

export interface MessagesService {
  list(sessionId: SessionId): Promise<Result<readonly Message[], AppError>>;
  get(id: MessageId): Promise<Result<Message, AppError>>;
  append(
    input: Pick<Message, 'sessionId' | 'role' | 'content'>,
  ): Promise<Result<Message, AppError>>;
}

export interface ProjectsService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly unknown[], AppError>>;
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

export interface CredentialsService {
  get(key: string): Promise<Result<string, AppError>>;
  set(key: string, value: string, options?: CredentialSetOptions): Promise<Result<void, AppError>>;
  delete(key: string): Promise<Result<void, AppError>>;
  list(): Promise<Result<readonly CredentialMetaView[], AppError>>;
  rotate(key: string, newValue: string): Promise<Result<void, AppError>>;
}

export interface SourcesService {
  list(): Promise<Result<readonly unknown[], AppError>>;
}

export interface AgentsService {
  list(): Promise<Result<readonly unknown[], AppError>>;
}

export interface AuthService {
  getMe(): Promise<Result<IpcSession, AppError>>;
  sendOtp(email: string): Promise<Result<void, AppError>>;
  verifyOtp(email: string, code: string): Promise<Result<IpcSession, AppError>>;
  signOut(): Promise<Result<void, AppError>>;
}

export interface MarketplaceService {
  list(): Promise<Result<readonly unknown[], AppError>>;
}

export interface SchedulerService {
  list(workspaceId: WorkspaceId): Promise<Result<readonly unknown[], AppError>>;
}

export interface UpdatesService {
  check(): Promise<Result<{ hasUpdate: boolean; version?: string }, AppError>>;
}

export interface PlatformService {
  readFileAsDataUrl?(path: string): Promise<string>;
  openExternal?(url: string): Promise<void>;
  copyToClipboard?(text: string): Promise<void>;
  showItemInFolder?(path: string): Promise<void>;
}

export interface IpcContext {
  readonly event?: IpcInvokeEventLike;
  readonly traceId: string;
  readonly session?: IpcSession;

  readonly workspaces: WorkspacesService;
  readonly sessions: SessionsService;
  readonly messages: MessagesService;
  readonly projects: ProjectsService;
  readonly credentials: CredentialsService;
  readonly sources: SourcesService;
  readonly agents: AgentsService;
  readonly auth: AuthService;
  readonly marketplace: MarketplaceService;
  readonly scheduler: SchedulerService;
  readonly updates: UpdatesService;
  readonly platform?: PlatformService;
}
