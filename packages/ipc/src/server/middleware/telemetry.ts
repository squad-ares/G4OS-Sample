/**
 * Middleware de telemetria — abre um span OTel por procedure call.
 *
 * Spans aparecem no collector configurado quando o SDK está registrado
 * (ver `@g4os/observability/sdk`). Sem SDK, é NOOP — `@opentelemetry/api`
 * usa um tracer no-op default.
 *
 * Atributos do span: `rpc.system='trpc'`, `rpc.method=<path>`, `rpc.type=<query|mutation|subscription>`,
 * `rpc.user_id` (quando autenticado). Em erro, marca span como `ERROR` + grava exception event.
 *
 * Server-side spans only. Propagation cross-process
 * (renderer→main via traceparent header) virá em slice 2 quando custom tRPC
 * link for adicionado no renderer pra serializar `traceparent` no envelope IPC.
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc-base.ts';

const tracer = trace.getTracer('g4os-ipc', '1.0.0');

export const withTelemetry = middleware(({ next, path, type, ctx }) => {
  return tracer.startActiveSpan(`trpc.${type}.${path}`, async (span) => {
    span.setAttribute('rpc.system', 'trpc');
    span.setAttribute('rpc.method', path);
    span.setAttribute('rpc.type', type);
    const userId = (ctx as { session?: { userId?: string } }).session?.userId;
    if (userId) span.setAttribute('rpc.user_id', userId);

    try {
      const result = await next();
      // tRPC `next()` returns `Result<TData, TError>` shape — ok flag indicates
      // whether the procedure succeeded. Marca span como ERROR se procedure
      // returned a TRPCError (sem throw — tRPC normaliza).
      if (!result.ok) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.error.message,
        });
        span.recordException(result.error as Error);
      }
      return result;
    } catch (cause) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: cause instanceof Error ? cause.message : String(cause),
      });
      if (cause instanceof Error || cause instanceof TRPCError) {
        span.recordException(cause as Error);
      }
      throw cause;
    } finally {
      span.end();
    }
  });
});
