import type { IDisposable } from '@g4os/kernel/disposable';
import { toDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';
import type {
  AgentsService,
  AuthService,
  CredentialsService,
  IpcContext,
  MarketplaceService,
  MessagesService,
  ProjectsService,
  SchedulerService,
  SessionsService,
  SourcesService,
  UpdatesService,
  VoiceService,
  WorkspacesService,
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
  };
}

function createSessionsMock(): SessionsService {
  return {
    list: async () => ok([]),
    get: async () => err(notImplemented('sessions.get')),
    create: async () => err(notImplemented('sessions.create')),
    update: async () => ok(undefined),
    delete: async () => ok(undefined),
    subscribe: (_id, _handler): IDisposable =>
      toDisposable(() => {
        /* no-op: mock disposable */
      }),
    stopTurn: async () => ok(undefined),
    retryLastTurn: async () => ok(undefined),
    truncateAfter: async () => ok({ removed: 0 }),
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
    transcribe: () => Promise.reject(notImplemented('voice.transcribe')),
  };
}

function createProjectsMock(): ProjectsService {
  return { list: async () => ok([]) };
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

function createSourcesMock(): SourcesService {
  return { list: async () => ok([]) };
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
  };
}

function createMarketplaceMock(): MarketplaceService {
  return { list: async () => ok([]) };
}

function createSchedulerMock(): SchedulerService {
  return { list: async () => ok([]) };
}

function createUpdatesMock(): UpdatesService {
  return { check: async () => ok({ hasUpdate: false }) };
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
    sources: createSourcesMock(),
    agents: createAgentsMock(),
    auth: createAuthMock(),
    marketplace: createMarketplaceMock(),
    scheduler: createSchedulerMock(),
    updates: createUpdatesMock(),
    voice: createVoiceMock(),
    ...overrides,
  };
  return appRouter.createCaller(ctx);
}
