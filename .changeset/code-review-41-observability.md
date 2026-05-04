---
'@g4os/observability': patch
---

Code Review 41 — packages/observability — auditoria exaustiva contra ADRs 0011, 0012, 0060–0065, 0141, 0153 e tasks 06-observability/16-observability-stack.

Total: 13 findings (0 CRITICAL, 4 MAJOR, 5 MEDIUM, 4 LOW).

## F-CR41-1 — `auditProcessListeners` retorna apenas `> threshold`, perdendo "exatamente N" (MAJOR)

**Path:** `packages/observability/src/memory/memory-monitor.ts:166`
**ADR:** 0063

```ts
if (count > threshold) { ... }   // threshold=5 ignora count===5
```

ADR-0063 ("listeners acima de limiar default 5") + TASK-06-04 step 1 (`if (count > 5) log.warn`) sugerem inclusivo. O código exclui `count === threshold`, então o caso "5 listeners em uncaughtException" (já preocupante — Node default warning é 10, mas 5 já é sinal) passa silencioso. **Fix:** trocar `>` por `>=` OU renomear parâmetro para `excludeUpTo` e documentar. `snapshotProcessListeners` já contorna devolvendo todos.

## F-CR41-2 — `MemoryMonitor.dispose()` não para callback `onThresholdExceeded` em flight (MAJOR)

**Path:** `packages/observability/src/memory/memory-monitor.ts:97-150`
**ADR:** 0012, 0063

`sampleOnce()` invoca `this.onThresholdExceeded?.(...)` sem checar `this._disposed`. Sequência crash: `clearInterval` em `dispose()` pode rodar APÓS o callback do interval já ter entrado em `sampleOnce()`. Resultado: `onThresholdExceeded` (que tipicamente chama `metrics.workerMemoryRss.set` e `sentry.addBreadcrumb`) executa em monitor descartado. ADR-0012 obriga "limpa todo recurso e idempotência em dispose". Fix:

```ts
sampleOnce(): MemorySample {
  if (this._disposed) return EMPTY_SAMPLE; // ou throw
  // ...
  if (!this._disposed) this.onThresholdExceeded?.(reason, sample);
}
```

Mesmo guard em `checkThresholds`. Combinar com F-CR41-3 abaixo.

## F-CR41-3 — Memory monitor não empurra para `metrics.workerMemoryRss` nem para Sentry breadcrumb (parity gap MAJOR)

**Path:** `apps/desktop/src/main/services/observability-runtime.ts:86-89`
**ADR:** 0063 ("monitor é pluggable — bootstrap instancia um `MemoryMonitor` por processo passando `onThresholdExceeded` que empurra para `metrics.workerMemoryRss` (ADR-0064) e para Sentry breadcrumb")

`onThresholdExceeded` no bootstrap só faz `log.warn`. O contrato declarado em ADR-0063 — propagação para `metrics.workerMemoryRss` e Sentry breadcrumb — está por implementar. Custo: alertas de memória só aparecem em pino logs (sem dashboard, sem correlação no Sentry). Fix: injetar `metrics` + `sentry.addBreadcrumb` no callback. Parte do bug é `MemoryMonitor` não setar label `session_id` (gauge tem o label mas RAM do main não tem session — passar `'main'` ou `''`). Recomendado expor `setMain()` helper no pacote.

## F-CR41-4 — `setUser` nunca é chamado no main process; sem cleanup em logout (MAJOR)

**Path:** `apps/desktop/src/main/services/observability-runtime.ts` + qualquer auth handler
**ADR:** 0062 ("PII config + user context cleanup em logout")

Renderer chama `updateRendererSentryUser` em login/logout. Main expõe `sentry.setUser` no handle mas NUNCA é chamado em login nem em logout. Resultado: erros de main capturados pelo Sentry chegam sem userId/email — corre­lacionar erro de main com renderer fica impossível, e em hipótese de re-login (mesmo processo, novo user) breadcrumbs/contexts retêm dados do user anterior. Fix: wire `ManagedLoginService.onAuthChange` → `obs.sentry.setUser({ id })` (sem email, ADR-0062 PII) e `setUser(null)` em logout. Documentar contrato.

## F-CR41-5 — `getMetrics()` singleton liga `collectDefaultMetrics` em testes silenciosamente (MEDIUM)

**Path:** `packages/observability/src/metrics/registry.ts:42-49,180-183`
**ADR:** 0064

`getMetrics()` chama `createMetrics()` sem opções → `includeDefaults: true`. Em qualquer teste que use `getMetrics()` (fora do controle do autor), prom-client v15 anexa `eventLoopMonitor` via `setImmediate` recursivo, poluindo snapshots e segurando GC. ADR-0064 fala em "registry instanciado para testabilidade", mas a porta de entrada singleton não respeita. Fix: detectar `NODE_ENV === 'test'` (via `@g4os/platform`) ou alinhar com `vitest` ENV; ou exigir que `getMetrics()` seja chamado só em produção e tests usem `createMetrics({ includeDefaults: false })` direto. Pelo menos documentar.

## F-CR41-6 — Catalog drift: `@opentelemetry/api`, `prom-client`, OTel SDK e `@sentry/electron` fora do catálogo pnpm (MEDIUM)

**Path:** `packages/observability/package.json:45-62`, `packages/ipc/package.json:38`, `apps/desktop/package.json:109-113`
**ADR:** 0153

ADR-0153: "dep presente em 2+ packages" → catalog. Drifts atuais (todos fora de `pnpm-workspace.yaml`):
- `@opentelemetry/api@1.9.0` em `ipc` + `observability` (2x)
- `@opentelemetry/exporter-trace-otlp-http@0.215.0` em `observability` + `apps/desktop` (2x)
- `@opentelemetry/resources@2.7.0` (2x), `@opentelemetry/sdk-node@0.215.0` (2x), `@opentelemetry/sdk-trace-base@2.7.0` (2x)
- `@sentry/electron@5.10.0` (2x — observability optional + apps/desktop)
- `prom-client@15.1.3` em `observability` apenas (1x — pode ficar literal por enquanto, mas dep transitiva via `@g4os/observability` qualifica)

Sintoma: bump de OTel exige tocar 6 arquivos coordenados; risco de divergência silenciosa entre versão usada para typecheck (observability) e bundle (desktop). Fix: mover todos os 6 para `pnpm-workspace.yaml` `catalog:` e substituir versões literais por `"catalog:"`.

## F-CR41-7 — `withSpan` força `options` mesmo quando não há atributo (LOW)

**Path:** `packages/observability/src/tracer.ts:12-16`
**ADR:** 0061

Assinatura única `withSpan(name, options, fn)` obriga callers a passar `{}` quando não precisam atributos (visto nos próprios testes: `withSpan('test.fail', {}, ...)`). Caller code fica ruidoso e hot path do turn dispatcher tem 3 `{}` literais em sequência. Fix: overload — `withSpan<T>(name, fnOrOptions, fn?)` ou simplesmente tornar `options` opcional com default `{}`. Mantém binary compat dos consumers atuais.

## F-CR41-8 — `tracesSampleRate` Sentry default 0.1 sem distinção dev vs prod (LOW)

**Path:** `packages/observability/src/sentry/init.ts:58`
**ADR:** 0062

`tracesSampleRate: options.tracesSampleRate ?? 0.1` para todos os ambientes. Em dev/test sem DSN é NOOP (irrelevante), mas em CI/staging com DSN apontando para projeto compartilhado, 10% de transações é caro. ADR-0062 não fixa o número. Fix: dev default `0`, staging `0.05`, prod `0.1` — caller passa explicit baseado em `environment`. Ou pelo menos documentar que `tracesSampleRate` deve vir via env var por ambiente.

## F-CR41-9 — `IpcMetricsRegistry` é singleton module-level com `clear()` exposto sem proteção (LOW)

**Path:** `packages/observability/src/ipc/metrics-registry.ts:144-149`
**ADR:** 0011, 0012

`export const ipcMetrics = new IpcMetricsRegistry();` — qualquer consumer (incluindo testes em outros pacotes) pode `ipcMetrics.clear()` durante o run e zerar contadores que outro teste paralelo está observando. ADR-0012 sugere DisposableBase para state com lifecycle; aqui o singleton nunca é disposed e nunca é injetável. Fix: ou exportar uma factory + injetar pelo composition root (espelho do `metrics/registry.ts`), ou marcar `clear()` como `/** @internal */` e mover para test-utility. Singleton com side-effect global em pacote compartilhado é antipattern.

## F-CR41-10 — `scrubObject` perde Symbol-keyed properties silenciosamente sem teste de regressão (MEDIUM)

**Path:** `packages/observability/src/sentry/scrub.ts:127-128`
**ADR:** 0062

Comentário declara "Symbol-keyed slots são propositalmente descartados" — mas não há nem um teste cobrindo este caminho, e Sentry/Otel SDKs ocasionalmente anexam contexto via `Symbol(...)` (fluent assertions, telemetria interna). Em caso de regressão (alguém troca `Reflect.ownKeys` por `Object.entries`), nenhum gate detecta. Fix: adicionar teste em `scrub.test.ts`:

```ts
it('drops symbol-keyed properties', () => {
  const sym = Symbol.for('pii');
  const out = scrubObject({ a: 1, [sym]: 'leak' });
  expect(Object.getOwnPropertySymbols(out)).toHaveLength(0);
});
```

## F-CR41-11 — `redactSecretsInText` é alias de `scrubString` sem valor agregado (LOW)

**Path:** `packages/observability/src/debug/redact.ts:1-9`
**ADR:** 0065

```ts
export function redactSecretsInText(text: string): string { return scrubString(text); }
export function sanitizeConfig<T>(config: T): T { return scrubObject(config); }
```

Dois alias renomeando `scrubString`/`scrubObject` quebra "uma fonte de verdade" do ADR-0065 ("redação dupla colocadas no pacote para compartilhar — nova chave atualiza em um lugar só"). Devs vão buscar onde estende cada um e descobrir que são pass-through, criando confusão. Fix: re-exportar diretamente os nomes canônicos do `sentry/scrub.ts` em `debug/index.ts`, OU manter os aliases e documentar como deprecated.

## F-CR41-12 — `MemoryMonitor.start()` re-entrante após primeiro `start()` é silencioso, mas `setInterval` cleanup só é registrado uma vez (MEDIUM)

**Path:** `packages/observability/src/memory/memory-monitor.ts:64-95`
**ADR:** 0012

`if (this.timer) return;` previne segundo `start()`. OK. Mas se alguém faz `start() → dispose() → start()` (caso real em hot reload em dev), o segundo `start()` não dispara porque o `_disposed` guard rejeita (linha 72). Comportamento correto, mas o método `start()` deveria ser explicitamente idempotente OU lançar erro no segundo start em monitor disposed (ADR-0012 padrão). Fix: documentar que `dispose()` é terminal; ou separar `pause()/resume()` se hot reload é caso de uso.

## F-CR41-13 — `posthog-node` flush não é aguardado em shutdown rápido (MEDIUM)

**Path:** `packages/observability/src/posthog/init.ts:115-122`
**ADR:** 0062 (privacy + graceful shutdown), 0032

`shutdown` chama `client.shutdown()` (que internamente flush e fecha) com `try/catch` mas SEM `Promise.race` contra timeout. Em graceful shutdown de 5s (ADR-0032), se PostHog API estiver lenta/indisponível, `Promise.all([telemetry.shutdown(), sentry.close()])` em `observability-runtime.ts:130` esperaria PostHog indefinidamente — só que PostHog NEM ESTÁ no `dispose()` do runtime (não foi wired). Duplo gap:

1. PostHog handle nunca é instanciado em `apps/desktop/src/main` (procura: zero hits para `initPostHog` fora do pacote). Telemetria de produto está dormente.
2. Se for wired, falta `Promise.race(client.shutdown(), timeout(2000))` para respeitar deadline de shutdown.

Fix: wire em `observability-runtime.ts` quando `G4OS_POSTHOG_KEY` + consent existir; envolver shutdown em timeout 2s.

---

**Áreas cobertas:** Pino redaction (delegado a `@g4os/kernel/logger` — ADR-0060 OK); OTel API + lazy SDK + W3C propagation (OK); Sentry scrub + lazy + NOOP (OK exceto F-CR41-4/8); Memory monitor + leak detector (F-CR41-1/2/3/12); Prometheus metrics + buckets + cardinality (OK; labels `session_id` em workerMemoryRss/workerRestartTotal são UUIDs — cardinality alta, mas justificável por debug — não findei separadamente); Debug export + redação dupla + cleanup parcial (OK); Turn telemetry (OK, idempotência testada); Posthog (F-CR41-13); Result/Disposable (parcial: Memory F-CR41-2/12); Boundary observability-isolated (OK via cruiser); TS strict zero `any` (OK); TODO/FIXME/console (zero); Catalog drift (F-CR41-6).

**V1 parity:** V1 não tinha pacote observability (logger por feature, Sentry inline, sem OTel, sem prom-client). V2 supera V1 em todos os eixos. memlab CI noturno permanece como FOLLOWUP declarado em ADR-0063 — não é gap.

**Tasks 16-observability-stack** (otel-collector, grafana-loki-tempo, prometheus, dashboards, runbook): infra/operações — fora do escopo desta lib (lib só expõe `/metrics` text format e OTLP exporter). OK.
