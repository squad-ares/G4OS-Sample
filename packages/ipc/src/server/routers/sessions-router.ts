/**
 * Sessions router — composição dos sub-routers (CR4-04).
 *
 * Split em 3 sub-arquivos para manter cada um abaixo do gate informal de
 * 300 LOC para routers IPC:
 *   - `sessions-router-core.ts`        — lifecycle (CRUD, archive, pin, label)
 *   - `sessions-router-runtime.ts`     — turn execution + busca global
 *   - `sessions-router-subscriptions.ts` — streams de eventos
 *
 * Composição via spread em `router({ ...core, ...runtime, ...subs })` é
 * suportada pelo tRPC v11 sem perda de type safety.
 */

import { SessionEventSchema, TurnStreamEventSchema } from '@g4os/kernel/schemas';
import { router } from '../trpc.ts';
import { sessionsCoreRouter } from './sessions-router-core.ts';
import { sessionsRuntimeRouter } from './sessions-router-runtime.ts';
import { sessionsSubscriptionsRouter } from './sessions-router-subscriptions.ts';

export const sessionsRouter = router({
  ...sessionsCoreRouter._def.procedures,
  ...sessionsRuntimeRouter._def.procedures,
  ...sessionsSubscriptionsRouter._def.procedures,
});

export { SessionEventSchema, TurnStreamEventSchema };
