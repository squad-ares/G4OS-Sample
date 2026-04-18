import { AppError } from '@g4os/kernel/errors';
import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';
import { superjson } from '../shared/superjson-setup.ts';
import type { IpcContext } from './context.ts';

const t = initTRPC.context<IpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    const extra: Record<string, unknown> = {};

    if (cause instanceof AppError) {
      extra['appError'] = cause.toJSON();
      extra['errorType'] = cause.constructor.name;
    }

    if (cause instanceof ZodError) {
      extra['zodIssues'] = cause.issues;
    }

    return {
      ...shape,
      data: { ...shape.data, ...extra },
    };
  },
});

export const router = t.router;
export const baseProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;
export const middleware = t.middleware;
