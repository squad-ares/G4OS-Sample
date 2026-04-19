import { context, propagation, trace } from '@opentelemetry/api';

export type TraceCarrier = Record<string, string>;

export function injectTraceContext(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

export function runWithExtractedContext<T>(carrier: TraceCarrier | undefined, fn: () => T): T {
  if (!carrier || Object.keys(carrier).length === 0) {
    return fn();
  }
  const parent = propagation.extract(context.active(), carrier);
  return context.with(parent, fn);
}

export interface ActiveTraceIds {
  readonly traceId: string;
  readonly spanId: string;
}

export function getActiveTraceIds(): ActiveTraceIds | undefined {
  const span = trace.getSpan(context.active());
  if (!span) return undefined;
  const ctx = span.spanContext();
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}
