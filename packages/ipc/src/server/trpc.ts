import { withLogging } from './middleware/logging.ts';
import { withMetrics } from './middleware/metrics.ts';
import { withTelemetry } from './middleware/telemetry.ts';
import { baseProcedure } from './trpc-base.ts';

export { mergeRouters, middleware, router } from './trpc-base.ts';
export const procedure = baseProcedure.use(withLogging).use(withTelemetry).use(withMetrics);
