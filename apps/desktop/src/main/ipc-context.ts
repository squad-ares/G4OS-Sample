/**
 * Monta o `IpcContext` concreto consumido pelos routers tRPC.
 *
 * Cada serviço (`workspaces`, `sessions`, ...) é injetado como
 * dependência para manter o ponto de composição único. Por ora os
 * serviços são stubs que retornam erros tipados; implementações reais
 * chegam nas tasks de features/agents/sources.
 */

import type {
  AgentsService,
  AuthService,
  CredentialsService,
  IpcContext,
  IpcInvokeEventLike,
  MarketplaceService,
  MessagesService,
  ProjectsService,
  SchedulerService,
  SessionsService,
  SourcesService,
  UpdatesService,
  WorkspacesService,
} from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err } from 'neverthrow';

export interface CreateContextInput {
  readonly event?: IpcInvokeEventLike;
}

export function createContext(input: CreateContextInput = {}): IpcContext {
  return {
    ...(input.event ? { event: input.event } : {}),
    traceId: generateTraceId(),
    workspaces: notImplementedWorkspaces,
    sessions: notImplementedSessions,
    messages: notImplementedMessages,
    projects: notImplementedProjects,
    credentials: notImplementedCredentials,
    sources: notImplementedSources,
    agents: notImplementedAgents,
    auth: notImplementedAuth,
    marketplace: notImplementedMarketplace,
    scheduler: notImplementedScheduler,
    updates: notImplementedUpdates,
  };
}

function generateTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function notImplemented(scope: string): AppError {
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: `Serviço ${scope} ainda não implementado neste scaffold`,
    context: { scope },
  });
}

const notImplementedWorkspaces: WorkspacesService = {
  list: async () => err(notImplemented('workspaces.list')),
  get: async () => err(notImplemented('workspaces.get')),
  create: async () => err(notImplemented('workspaces.create')),
  update: async () => err(notImplemented('workspaces.update')),
  delete: async () => err(notImplemented('workspaces.delete')),
};

const notImplementedSessions: SessionsService = {
  list: async () => err(notImplemented('sessions.list')),
  get: async () => err(notImplemented('sessions.get')),
  create: async () => err(notImplemented('sessions.create')),
  update: async () => err(notImplemented('sessions.update')),
  delete: async () => err(notImplemented('sessions.delete')),
  subscribe: () => ({
    dispose: () => {
      // Stub: nenhum recurso a liberar enquanto o serviço real não chega.
    },
  }),
};

const notImplementedMessages: MessagesService = {
  list: async () => err(notImplemented('messages.list')),
  get: async () => err(notImplemented('messages.get')),
  append: async () => err(notImplemented('messages.append')),
};

const notImplementedProjects: ProjectsService = {
  list: async () => err(notImplemented('projects.list')),
};

const notImplementedCredentials: CredentialsService = {
  get: async () => err(notImplemented('credentials.get')),
  set: async () => err(notImplemented('credentials.set')),
  delete: async () => err(notImplemented('credentials.delete')),
};

const notImplementedSources: SourcesService = {
  list: async () => err(notImplemented('sources.list')),
};

const notImplementedAgents: AgentsService = {
  list: async () => err(notImplemented('agents.list')),
};

const notImplementedAuth: AuthService = {
  getMe: async () => err(notImplemented('auth.getMe')),
  sendOtp: async () => err(notImplemented('auth.sendOtp')),
  verifyOtp: async () => err(notImplemented('auth.verifyOtp')),
  signOut: async () => err(notImplemented('auth.signOut')),
};

const notImplementedMarketplace: MarketplaceService = {
  list: async () => err(notImplemented('marketplace.list')),
};

const notImplementedScheduler: SchedulerService = {
  list: async () => err(notImplemented('scheduler.list')),
};

const notImplementedUpdates: UpdatesService = {
  check: async () => err(notImplemented('updates.check')),
};
