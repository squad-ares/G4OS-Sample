import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc-base.ts';

const buckets = new Map<string, { count: number; resetAt: number }>();

// Lazy GC. Sem cleanup, cada novo `(userId, path)` adiciona uma
// entrada permanente; buckets cresce indefinidamente em sessões longas
// (cada procedure invocada gera uma key). A cada N hits, varre buckets
// e remove os com `resetAt` no passado. Trade-off: O(n) ocasional vs
// memory leak permanente.
const GC_INTERVAL_HITS = 100;
let hitsSinceGc = 0;

function maybeGc(now: number): void {
  hitsSinceGc += 1;
  if (hitsSinceGc < GC_INTERVAL_HITS) return;
  hitsSinceGc = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function rateLimit(options: { windowMs: number; max: number }) {
  return middleware(({ ctx, path, next }) => {
    const key = `${ctx.session?.userId ?? 'anon'}:${path}`;
    const now = Date.now();
    maybeGc(now);
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
