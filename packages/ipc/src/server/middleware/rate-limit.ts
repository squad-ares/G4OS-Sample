import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc-base.ts';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: { windowMs: number; max: number }) {
  return middleware(({ ctx, path, next }) => {
    const key = `${ctx.session?.userId ?? 'anon'}:${path}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    } else if (bucket.count >= options.max) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded for ${path}`,
      });
    } else {
      bucket.count++;
    }

    return next();
  });
}
