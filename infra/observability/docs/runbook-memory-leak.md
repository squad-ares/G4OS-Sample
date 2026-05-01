# Runbook: Memory leak suspeito

**Quando usar:** suporte recebeu reclamação de "app fica lento depois de horas"
ou alerta `RSSAbove1GB`/`HeapGrowthSustained` disparou no Sentry/Prometheus.

**Tempo alvo:** identificar leak vs variação normal em ≤5 minutos.

---

## 1. Sintomas que disparam este runbook

- Cliente reporta lentidão após várias horas de uso contínuo.
- Sentry alert `RSSAbove1GB` disparou (RSS > 1 GiB sustentado 10 min).
- Prometheus alert `HeapGrowthSustained` disparou (taxa > 5 MB/min por 10 min).
- Ticket de suporte mencionando travamento sem crash.

## 2. Diagnóstico em 5 minutos

### 2.1. Abra o dashboard `G4OS Memory` (uid `g4os-memory`)

Filtros:
- `service=g4os-desktop`
- `env=` (o env onde rodou o incidente — `dev`/`staging`/`prod`)
- Período: `last 6h` (ou estender pra `24h` se a reclamação for "ontem à noite")

### 2.2. Olhe o painel "Heap growth rate (5m)"

Heurística:

| Taxa de crescimento | Diagnóstico |
|---|---|
| < 33 KB/s (~2 MB/min) | Variação normal — variável de carga, não leak. |
| 33–87 KB/s (2–5 MB/min) | **Atenção.** Observar por ≥10 min. Pode ser carga; pode ser leak inicial. |
| > 87 KB/s (~5 MB/min) sustentado 10 min | **Leak confirmado.** |

### 2.3. Confirme via "Listener count by origin"

Top 10 origins de listener. Sintomas de leak:
- Algum origin com **>50 listeners** ou crescendo monotonicamente sem queda.
- `EventEmitter` registrado em loop sem `dispose()` correspondente.

Origins comuns que têm leak no V1:
- `chokidar` (workaround V2: `@parcel/watcher` substitui — ADR-0030 obsoleto).
- `EventEmitter` em sources MCP stdio sem unsubscribe no shutdown.
- Listeners `app.on('window-all-closed')` registrados em hot-reload sem cleanup.

### 2.4. Logs correlacionados em Loki

```
{service="g4os-desktop"} |~ "leak|disposable|listener" | json
```

Procura:
- `pino` warns `[leak-detector] stale listener: <origin>` — indica `WeakRef` que não foi GC após shutdown.
- `MemoryMonitor` warnings `RSS exceeds threshold` ou `heap growth rate exceeds threshold`.
- Stack traces de `dispose()` falhando — race entre dispose + close.

### 2.5. Trace específico via session_id

Se cliente forneceu `session_id`:

```
# Tempo (TraceQL)
{service.name="g4os-desktop" && session.id="<id>"}
```

Procura: spans muito longos (>30s) sem child spans — geralmente indicam stream
agente que não fechou, retentor de buffer crescendo.

## 3. Mitigação

### Imediato (cliente reportando ativo)
- Pedir ao cliente para reiniciar o app. Estado em memória é volátil; sessões
  estão event-sourced em JSONL — não há perda.
- Se múltiplos clientes reportando: considerar feature flag pra desabilitar
  feature mais recente até hotfix.

### Curto prazo (24-48h)
- Identificar origin culpado pela contagem de listeners (passo 2.3).
- Procurar último merge que tocou no módulo culpado:
  ```
  git log --since="3 days ago" -- packages/<modulo>/
  ```
- Reproduzir leak com `memlab` em CI noturno (`pnpm --filter @g4os/desktop-e2e test:memory`).

### Longo prazo
- Adicionar regra Biome custom flagando `new EventEmitter()` sem `extends DisposableBase`
  ou `this._register(toDisposable(...))` no escopo.
- Se origin é classe nossa: garantir extends `DisposableBase` (ADR-0012).
- Se origin é dep externa: avaliar substituição (V1 chokidar → V2 `@parcel/watcher`
  é o caso de referência).

## 4. Quando escalar

- Leak persiste depois de restart do cliente.
- Heap growth rate >10 MB/min — pode causar OOM em <30 min.
- Listener count cresce sem mecanismo aparente (sem ação do user).
- Múltiplos clientes na mesma janela de 24h.

Escalar para: dev senior + abrir incident-channel no Slack `#g4os-incidents`.

## 5. Referências

- Dashboard: `G4OS Memory` (uid `g4os-memory`)
- ADR-0012 — IDisposable + DisposableBase
- ADR-0030 (superseded by 0145) — process isolation rejeitada; main thin é o caminho
- ADR-0063 — MemoryMonitor + ListenerLeakDetector
- `packages/observability/src/memory/{memory-monitor,leak-detector}.ts`
