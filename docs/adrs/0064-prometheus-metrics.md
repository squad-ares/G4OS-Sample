# ADR 0064: Métricas de performance no formato Prometheus (registry isolado)

## Metadata

- **Numero:** 0064
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead, @devex
- **Task relacionada:** TASK-06-05 (epic 06-observability)

## Contexto

v1 tinha `diagnostics-perf.ts` ad-hoc: counters espalhados, sem labels padronizadas, sem endpoint de exportação. Dashboard ficava impossível de montar sem reler o código.

Objetivo v2:
1. Catálogo único de métricas com nomes e labels consistentes (`g4os_<area>_<metric>_<unit>`).
2. Exportável em formato Prometheus (`text/plain; version=0.0.4`).
3. Registry isolado por factory para permitir testes determinísticos e múltiplas instâncias (ex.: prod + debug snapshot).

## Opções consideradas

### Opção A: OpenTelemetry Metrics
**Pros:** Mesma stack de tracing (ADR-0061).
**Contras:** Spec ainda em evolução rápida, exporters para Prometheus são pesados; ecosistema menor do que `prom-client`.

### Opção B: StatsD + Datadog agent
**Pros:** Simples de emitir.
**Contras:** Requer agent instalado; vendor-inclinado.

### Opção C: `prom-client` com `Registry` injetável (aceita)
**Descrição:**
- [`packages/observability/src/metrics/registry.ts`](../../packages/observability/src/metrics/registry.ts) — `createMetrics()` retorna `G4Metrics` com `Registry` novo + counters/gauges/histograms tipados com labels fixos. `getMetrics()` expõe singleton global; `resetMetrics()` limpa para testes.
- Métricas cobertas nesta fase: IPC (`ipcRequestDuration`, `ipcRequestTotal`), sessions (`sessionActive`), agent (`agentRequestDuration`, `agentTokensTotal`), MCP (`mcpSubprocessCount`, `mcpToolCallDuration`, `mcpSubprocessCrashTotal`), worker (`workerMemoryRss`, `workerRestartTotal`).
- Buckets por área: IPC em milissegundos (0.001..10s), agent em segundos (0.1..120s), MCP em segundos (0.01..30s).
- `exportMetrics(metrics?)` devolve `Promise<string>` com o conteúdo pronto para HTTP; `exportContentType()` devolve o MIME para respostas.
- [`timers.ts`](../../packages/observability/src/metrics/timers.ts) — `startHistogramTimer(histogram, labels)` usa `process.hrtime.bigint()`, retorna `HistogramTimer` com `.end(extraLabels?)`; labels mesclados antes do `observe`.

## Decisão

**Opção C.** `prom-client@15.1.3` como dependência runtime (não opcional — métricas em runtime fazem parte do produto). `Registry` é **instanciado** em vez de usar o default global — prioriza testabilidade e evita colisão entre módulos que importam `prom-client` transitivamente.

## Consequências

### Positivas
- Tudo em um arquivo (`registry.ts`) — grep direto descobre o catálogo sem diagnostics-perf-ish.
- Gate `useAwait: error` forçou `exportMetrics` a retornar `Promise<string>` sem `async` redundante (a lib já devolve Promise).
- Dashboards viram config no futuro (`infrastructure/grafana/*`), desacoplados do código.

### Negativas / Trade-offs
- `setDefaultLabels({ app: 'g4os' })` adiciona o label `app="g4os"` em todos os outputs. Dashboard precisa filtrar por `app`; ordem de labels no formato Prometheus não é estável, testes usam regex para cobrir isso.
- Em `worker_thread`, cada worker precisa ter seu próprio `Registry` (`createMetrics()`) e exportar via IPC ou arquivo quando requisitado — singleton do main não enxerga.

### Neutras
- `prom-client` é sólido e mantido por `siimon` — não é risco de abandono.

## Validação

- 5 testes (`metrics.test.ts`): formato Prometheus com default label, IPC histogram+counter, tokens por tipo, `startHistogramTimer` com elapsed ≥ 0 e count registrado, isolamento entre registries criados separadamente.

## Referencias

- [prom-client](https://github.com/siimon/prom-client)
- [Prometheus exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/)
- `STUDY/Audit/Tasks/06-observability/TASK-06-05-perf-metrics.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-06-05 landed)
