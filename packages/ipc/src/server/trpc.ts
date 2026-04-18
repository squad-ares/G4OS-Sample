import { withLogging } from './middleware/logging.ts';
import { withTelemetry } from './middleware/telemetry.ts';
import { baseProcedure } from './trpc-base.ts';

export { mergeRouters, middleware, router } from './trpc-base.ts';
export const procedure = baseProcedure.use(withLogging).use(withTelemetry);
