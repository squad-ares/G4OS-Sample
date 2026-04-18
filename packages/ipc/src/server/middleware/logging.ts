import { randomUUID } from 'node:crypto';
import { createLogger, type LogContext } from '@g4os/kernel/logger';
import { middleware } from '../trpc-base.ts';

const log = createLogger('ipc');

export const withLogging = middleware(async ({ path, type, ctx, next }) => {
  const traceId = ctx.traceId ?? randomUUID();
  const start = performance.now();

  const logCtx: LogContext = { traceId, procedure: path, type };
  if (ctx.session?.userId !== undefined) {
    logCtx.userId = ctx.session.userId;
  }

  log.debug(logCtx, 'ipc request started');

  const result = await next({ ctx: { ...ctx, traceId } });

  const durationMs = performance.now() - start;
  if (result.ok) {
    log.info({ ...logCtx, durationMs }, 'ipc request ok');
  } else {
    log.error(
      { ...logCtx, durationMs, err: result.error.message, code: result.error.code },
      'ipc request failed',
    );
  }

  return result;
});
