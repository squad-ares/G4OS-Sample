# ADR 0141: Chat observability — TurnTelemetry Prometheus + OpenTelemetry spans

## Metadata

- **Numero:** 0141
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-OUTLIER-22 (chat observability)

## Contexto

Diagnosticar turn lifecycle em produção requer sinais estruturados em 3 dimensões:

1. **Quem falhou e por quê**: counters de erro por `provider`/`error_code`.
2. **Quanto demorou**: histogramas por `provider`/`model`/`outcome`.
3. **Onde falhou dentro do turn**: span tree (dispatch → tool_loop → tool.execute × N → permission_request → ...).

ADRs 0060 (pino), 0061 (OTel), 0064 (prom-client registry) estabeleceram a infra. OUTLIER-22 AC pedia instrumentação concreta do turn pipeline.

## Opções consideradas

### Opção A: Apenas logs pino com campos estruturados
**Contras:** sem agregação. Query manual no Loki/ElasticSearch pra computar p50/p99 por provider.

### Opção B: Só Prometheus metrics
**Contras:** não tem contexto de span tree. "Por que esse turn demorou 40s?" fica sem resposta.

### Opção C: TurnTelemetry (prom-client) + OTel spans em pontos-chave do pipeline (aceita)
**Descrição:**
- `packages/observability/src/metrics/turn-telemetry.ts` — `createTurnTelemetry({ provider })` retorna handle com `onStart()`, `onUsage({input, output})`, `onDone(reason)`, `onError(code)`. Internamente incrementa counters + observa histograms registrados em `metrics/registry.ts` (ADR-0064):
  - `g4os_turn_duration_seconds` (histogram, labels: provider, model, outcome)
  - `g4os_turn_errors_total` (counter, labels: provider, error_code)
  - `g4os_turn_tokens_total` (counter, labels: provider, direction=input|output)
- OTel spans em:
  - `turn.dispatch` (TurnDispatcher) — attributes: `session.id`
  - `tool.loop` (runToolLoop) — attributes: `session.id`, `turn.id`, `agent.model_id`
  - `tool.execute` (executeSingleTool) — attributes: `session.id`, `tool.name`, `tool.use_id`
- `withSpan()` wrapper do `@g4os/observability/tracer` (ADR-0061) — status OK/ERROR setado automaticamente, exception recordada em erro.

## Decisão

**Opção C.** TurnTelemetry emite metrics; `withSpan` envolve as 3 funções-chave. Prom-client registry é per-process (ADR-0064).

Attributes pattern: sempre `session.id` + contexto relevante ao span. Não emitimos `user.id` nem token plaintext — scrub rule de Sentry (ADR-0062) reaproveitado como reference para OTel attributes também.

## Consequências

### Positivas
- p50/p99 turn duration por provider queryable na hora (Grafana).
- Span tree visível no Jaeger/Tempo — operador vê onde o turn prendeu (permission_request vs tool.execute vs LLM call).
- `turn_errors_total` por `error_code` vira fonte pra alertas (ex: `rate(invalid_api_key[5m]) > 10`).

### Negativas / Trade-offs
- Overhead de span criation em cada tool_use. Medidor (Jest memlab benchmark) pendente — V1 rodando withSpan em hotpath não era visível, mas confirmar em v2.
- Zero spans em `PermissionBroker.request()` nesta iteração — user interaction é dominada por tempo de response humano, span seria mostly "waiting". Se virar relevante (ex: auto-approve path), FOLLOWUP.

### Neutras
- `packages/observability/src/sdk/init.ts` continua lazy-loading OTel SDK — sem `OTLP_ENDPOINT` env, `withSpan` usa NOOP tracer (ADR-0061). Zero overhead quando observabilidade está desligada.

## Validação

- 11 tests em `__tests__/turn-telemetry.test.ts` — onStart/onUsage/onDone/onError cobertos.
- Manual: com `OTLP_ENDPOINT` configurado, turns reais geram spans visíveis no Jaeger.
- `check:lint` não quebra com withSpan adicionado (biome aceita o pattern).

## Referencias

- ADR-0061 (OpenTelemetry tracing)
- ADR-0064 (Prometheus metrics)
- TASK-OUTLIER-22 em `STUDY/Outlier/`

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
