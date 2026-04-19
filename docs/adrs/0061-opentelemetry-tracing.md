# ADR 0061: OpenTelemetry para tracing distribuído (lazy SDK + propagation W3C)

## Metadata

- **Numero:** 0061
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead, @devex
- **Task relacionada:** TASK-06-02 (epic 06-observability)

## Contexto

v1 não correlaciona requisições entre processos. Um chat turn passa por renderer → main → worker → MCP subprocess → HTTP provider, e cada hop emite log isolado. Diagnóstico fica dependente de timestamps, o que é inviável no Windows onde o clock do worker às vezes diverge.

v2 precisa de:
1. Trace ID propagado em todo hop — renderer a provider.
2. SDK opcional no runtime: CI e dev sem endpoint OTLP devem funcionar sem nada instalado.
3. Zero custo quando desligado (NOOP completo, sem carregar binários).

## Opções consideradas

### Opção A: `pino` correlation ID manual
**Pros:** Zero deps novas.
**Contras:** Não propaga para processos filhos sem convenção custom; incompatível com instrumentação de libs de terceiros (`undici`, `fs`).

### Opção B: Datadog `dd-trace`
**Pros:** Auto-instrumentação.
**Contras:** Vendor lock-in, agent obrigatório, pacote enorme (>15MB).

### Opção C: OpenTelemetry API + SDK opcional (aceita)
**Descrição:**
- `@opentelemetry/api@1.9.0` como **dependência de runtime** (pacote mínimo, só tipos + NOOP tracer). Código anota `withSpan(...)` sempre que relevante.
- `@opentelemetry/sdk-node`, `exporter-trace-otlp-http`, `resources`, `sdk-trace-base`, `context-async-hooks` em **devDependencies**; carregados via `await import(/* @vite-ignore */ specifier)` apenas quando `initTelemetry({ otlpEndpoint })` é chamado.
- Sampler default: `ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) })`.
- Propagation via `W3CTraceContextPropagator` — helpers `injectTraceContext()` e `runWithExtractedContext(carrier, fn)` para IPC entre main↔worker e IPC↔HTTP.

## Decisão

**Opção C.** Implementação:

- [`packages/observability/src/tracer.ts`](../../packages/observability/src/tracer.ts) — `getTracer`, `withSpan<T>(name, options, fn)` com `.then/.catch/.finally` (evita `useAwait: error`) que marca status OK/ERROR e grava exception.
- [`packages/observability/src/propagation.ts`](../../packages/observability/src/propagation.ts) — inject/extract de headers `traceparent`/`tracestate` + `getActiveTraceIds()`.
- [`packages/observability/src/sdk/init.ts`](../../packages/observability/src/sdk/init.ts) — `initTelemetry(options)` lazy-loads NodeSDK + OTLP exporter; sem `otlpEndpoint` retorna NOOP handle. `diag.setLogger` conectado ao `createLogger('otel')`.
- Pacote `@g4os/observability` expõe `./sdk` como subpath para bootstrap (`apps/desktop/src/main/*`), enquanto o caminho "anota código" usa o barrel raiz.

## Consequências

### Positivas
- Anotações (`withSpan`) ficam estáveis; troca do backend (OTLP collector, Tempo, Honeycomb) é config-only.
- Overhead próximo de zero quando desligado — NOOP tracer do `api` não aloca spans.
- Auto-instrumentação futura (`@opentelemetry/instrumentation-*`) plug-and-play no init.

### Negativas / Trade-offs
- SDK em devDependency força o bootstrap a usar `await import(/* @vite-ignore */ specifier)`. Mantido consistente com `electron-runtime.ts`/`cpu-pool.ts` (ADR-0030).
- Renderer não monta SDK (overhead desnecessário no browser); spans de UI entram pelo IPC já instrumentado.

### Neutras
- Ratio 0.1 é o ponto de partida; feature flag em config abre para 1.0 em sessões de debug de usuário.

## Validação

- 4 testes (`packages/observability/src/__tests__/tracer.test.ts`) com `InMemorySpanExporter` + `AsyncHooksContextManager` + `W3CTraceContextPropagator`: span OK, span ERROR (status + exception), propagação via carrier, `getActiveTraceIds` retorna ids ativos dentro de `startActiveSpan`.

## Referencias

- [OpenTelemetry JS — Getting started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- `STUDY/Audit/Tasks/06-observability/TASK-06-02-opentelemetry.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-06-02 landed)
