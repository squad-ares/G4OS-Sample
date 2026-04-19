# ADR 0063: Memory monitoring + listener leak detection (WeakMap + WeakRef + Disposable)

## Metadata

- **Numero:** 0063
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead, @devex
- **Task relacionada:** TASK-06-04 (epic 06-observability)

## Contexto

O incidente "travamento por memória no Windows" da v1 tinha três causas compostas: (1) main monolítico ≥1461 LOC sem isolamento por sessão, (2) `chokidar` vazando handles, (3) listeners em `process` / `EventEmitter` adicionados sem remover. v2 resolveu (1) e (2) via arquitetura (ADR-0030, ADR-0012, `@parcel/watcher`). Falta telemetria ativa que catch-e a regressão antes de prod.

Objetivo:
1. Amostrar `process.memoryUsage()` periodicamente em main e workers.
2. Disparar callback quando RSS ou `heapUsed` ultrapassa threshold absoluto/razão de crescimento.
3. Auditar `process.listenerCount` para detectar acúmulo em `uncaughtException`, `unhandledRejection`, `SIGTERM`, `SIGINT`.
4. Ajudar diagnóstico de listeners por target sem segurar referências forte (vazaria o que estamos tentando medir).

## Opções consideradas

### Opção A: `memwatch-next`
**Pros:** GC event hooks nativos.
**Contras:** binário nativo; manutenção incerta para Node 24; adiciona dep pesada para uma abstração que já existe no Node (`perf_hooks`).

### Opção B: `memlab` em prod
**Pros:** detecta retenção heurística.
**Contras:** dep enorme; feito para CI E2E, não para runtime. Escopo diferente.

### Opção C: `MemoryMonitor` + `ListenerLeakDetector` + `memlab` só em CI (aceita)
**Descrição:**
- [`packages/observability/src/memory/memory-monitor.ts`](../../packages/observability/src/memory/memory-monitor.ts):
  - `MemoryMonitor extends DisposableBase` (ADR-0012).
  - Construtor aceita `intervalMs`, `thresholds { rssBytes, heapGrowthRatio }`, `historySize`, e injeções testáveis `now`, `memoryUsage`, `onSample`, `onThresholdExceeded`.
  - `start()` registra `setInterval().unref()` via `toDisposable`; `sampleOnce()` grava em `history[]` (ring FIFO), dispara callbacks quando thresholds estouram. Baseline de heap definido no primeiro sample.
  - `auditProcessListeners(events, threshold)` retorna listeners acima de limiar (default 5).
- [`packages/observability/src/memory/leak-detector.ts`](../../packages/observability/src/memory/leak-detector.ts):
  - `ListenerLeakDetector` mantém `WeakMap<object, Set<TrackedListener>>` + `Set<WeakRef<object>>` — targets liberados pelo GC somem do relatório.
  - `track`, `untrack`, `countFor`, `reportStale(maxAgeMs)` que remove `WeakRef` expirados on-the-fly.
- `memlab` permanece confinado a **CI noturno** (Playwright + Electron empacotado); não entra em runtime.

## Decisão

**Opção C.** O monitor é pluggable — bootstrap instancia um `MemoryMonitor` por processo (main, cada worker) passando `onThresholdExceeded` que empurra para `metrics.workerMemoryRss` (ADR-0064) e para Sentry breadcrumb. Disposição passa pelo graceful shutdown (ADR-0032).

## Consequências

### Positivas
- Sem dep nativa nova. `WeakMap`/`WeakRef` fazem o trabalho, consistente com pattern de `@g4os/kernel`.
- `DisposableBase` elimina a possibilidade do próprio monitor vazar o `setInterval` — o bug que estamos caçando.
- Test surface expressiva via injeção (`now`, `memoryUsage`).

### Negativas / Trade-offs
- `auditProcessListeners` só enxerga o processo atual; não consegue ver listeners "sobrevivendo" em workers sem IPC próprio. Aceitável — cada worker pode rodar a audit e enviar resultado via tRPC.
- `heapGrowthRatio` baseado no primeiro sample é frágil se o primeiro sample for anômalo (ex.: logo após um backup grande). Bootstrap pode adiar `start()` para depois da idle, ou resetar baseline manualmente se necessário.

### Neutras
- `memlab` em CI noturno fica documentado como follow-up (issue separada — requer Playwright + build completo + runner dedicado). Não bloqueia Epic 06.

## Validação

- 6 testes (`memory-monitor.test.ts`): sampling com clock fake, eviction da história, threshold RSS, threshold de crescimento de heap, start+dispose, `auditProcessListeners`.
- 4 testes (`leak-detector.test.ts`): contagem por event, untrack removendo exato handler, report de stale após maxAge, target não rastreado retorna 0.

## Referencias

- ADR-0012 (Disposable), ADR-0030 (utilityProcess), ADR-0032 (graceful shutdown).
- [memlab](https://facebook.github.io/memlab/) — CI noturno (follow-up)
- `STUDY/Audit/Tasks/06-observability/TASK-06-04-memory-monitoring.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-06-04 landed). `memlab` CI workflow marcado como follow-up.
