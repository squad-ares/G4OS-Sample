import { type Attributes, type Span, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';

export function getTracer(name: string, version?: string): Tracer {
  return trace.getTracer(name, version);
}

export interface WithSpanOptions {
  readonly attributes?: Attributes;
  readonly tracerName?: string;
}

export function withSpan<T>(
  name: string,
  options: WithSpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getTracer(options.tracerName ?? 'g4os');
  return tracer.startActiveSpan(
    name,
    options.attributes ? { attributes: options.attributes } : {},
    (span) =>
      fn(span)
        .then((result) => {
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        })
        .catch((err: unknown) => {
          // Span.recordException ou span.setStatus podem throw em
          // alguns transports (ex.: OTel SDK Node com endpoint indisponível
          // momentaneamente). Sem try/catch aqui o original `err` ficava
          // mascarado e finally `span.end()` nunca rodava → spans órfãos
          // no exporter que depois travam o batch processor.
          try {
            span.recordException(err as Error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
          } catch {
            // best-effort — preserve `err` original re-throwado abaixo
          }
          throw err;
        })
        .finally(() => {
          // span.end() também pode throw em transport falho — silenciamos
          // pra garantir que cleanup do span sempre roda.
          try {
            span.end();
          } catch {
            // best-effort cleanup
          }
        }),
  );
}
