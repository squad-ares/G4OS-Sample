import { ErrorCode } from '@g4os/kernel/errors';
import { TRPCError } from '@trpc/server';
import { procedure } from '../trpc.ts';
import { middleware } from '../trpc-base.ts';

const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.session?.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      cause: { code: ErrorCode.AUTH_NOT_AUTHENTICATED },
    });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const authed = procedure.use(isAuthed);
