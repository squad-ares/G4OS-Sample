import { agentsRouter } from './routers/agents-router.ts';
import { authRouter } from './routers/auth-router.ts';
import { credentialsRouter } from './routers/credentials-router.ts';
import { healthRouter } from './routers/health-router.ts';
import { marketplaceRouter } from './routers/marketplace-router.ts';
import { messagesRouter } from './routers/messages-router.ts';
import { platformRouter } from './routers/platform-router.ts';
import { projectsRouter } from './routers/projects-router.ts';
import { schedulerRouter } from './routers/scheduler-router.ts';
import { sessionsRouter } from './routers/sessions-router.ts';
import { sourcesRouter } from './routers/sources-router.ts';
import { updatesRouter } from './routers/updates-router.ts';
import { voiceRouter } from './routers/voice-router.ts';
import { workspacesRouter } from './routers/workspaces-router.ts';
import { router } from './trpc.ts';

export const appRouter = router({
  health: healthRouter,
  workspaces: workspacesRouter,
  sessions: sessionsRouter,
  messages: messagesRouter,
  projects: projectsRouter,
  credentials: credentialsRouter,
  sources: sourcesRouter,
  agents: agentsRouter,
  auth: authRouter,
  marketplace: marketplaceRouter,
  platform: platformRouter,
  scheduler: schedulerRouter,
  updates: updatesRouter,
  voice: voiceRouter,
});

export type AppRouter = typeof appRouter;
