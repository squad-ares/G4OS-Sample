import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';
import type {
  AgentsService,
  AuthService,
  CredentialsService,
  MarketplaceService,
  MessagesService,
  ProjectsService,
  SchedulerService,
  SessionsService,
  SourcesService,
  UpdatesService,
  VoiceService,
  WorkspacesService,
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
  readonly sources: SourcesService;
  readonly agents: AgentsService;
  readonly auth: AuthService;
  readonly marketplace: MarketplaceService;
  readonly scheduler: SchedulerService;
  readonly updates: UpdatesService;
  readonly voice: VoiceService;
}

export function createNullServices(): NullServices {
  return {
    workspaces: {
      list: async () => err(notImplemented('workspaces.list')),
      get: async () => err(notImplemented('workspaces.get')),
      create: async () => err(notImplemented('workspaces.create')),
      update: async () => err(notImplemented('workspaces.update')),
      delete: async () => err(notImplemented('workspaces.delete')),
    },
    sessions: {
      list: async () => err(notImplemented('sessions.list')),
      get: async () => err(notImplemented('sessions.get')),
      create: async () => err(notImplemented('sessions.create')),
      update: async () => err(notImplemented('sessions.update')),
      delete: async () => err(notImplemented('sessions.delete')),
      subscribe: () => ({ dispose: () => undefined }),
      stopTurn: async () => err(notImplemented('sessions.stopTurn')),
      retryLastTurn: async () => err(notImplemented('sessions.retryLastTurn')),
      truncateAfter: async () => err(notImplemented('sessions.truncateAfter')),
    },
    messages: {
      list: async () => err(notImplemented('messages.list')),
      get: async () => err(notImplemented('messages.get')),
      append: async () => err(notImplemented('messages.append')),
      search: async () => ok([]),
    },
    projects: {
      list: async () => err(notImplemented('projects.list')),
    },
    credentials: {
      get: async () => err(notImplemented('credentials.get')),
      set: async () => err(notImplemented('credentials.set')),
      delete: async () => err(notImplemented('credentials.delete')),
      list: async () => err(notImplemented('credentials.list')),
      rotate: async () => err(notImplemented('credentials.rotate')),
    },
    sources: {
      list: async () => err(notImplemented('sources.list')),
    },
    agents: {
      list: async () => err(notImplemented('agents.list')),
    },
    auth: {
      getMe: async () => err(notImplemented('auth.getMe')),
      sendOtp: async () => err(notImplemented('auth.sendOtp')),
      verifyOtp: async () => err(notImplemented('auth.verifyOtp')),
      signOut: async () => ok(undefined),
    },
    marketplace: {
      list: async () => err(notImplemented('marketplace.list')),
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
  };
}
