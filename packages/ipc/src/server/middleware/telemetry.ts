import { middleware } from '../trpc-base.ts';

/**
 * Placeholder do middleware de telemetria. Quando o OpenTelemetry for
 * conectado via @opentelemetry/api no processo main do Electron,
 * substituir por um span de tracer real. Mantido como no-op aqui para
 * que o @g4os/ipc não fique acoplado a decisões de transporte de telemetria.
 */
export const withTelemetry = middleware(({ next }) => next());
