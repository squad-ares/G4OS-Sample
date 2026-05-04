---
'@g4os/usage-reconcile-worker': patch
---

Code Review 50 — packages/usage-reconcile-worker — auditoria do skeleton TASK-18-07.

Pacote é skeleton declarado (ver `docs/deferred/usage-reconcile-worker.md`) — implementação real adiada até backend de billing existir. A revisão foca **na superfície pública**, porque ela é o contrato que vai congelar a integração quando billing entrar; defeitos de design hoje custam barato, depois custam migração.

V1 parity: V1 (`G4OS/apps/usage-reconcile-worker`) é Cloudflare Worker server-side rebuilding aggregates de R2/D1 — modelo distinto (server, não client-side reconciliation). Não há parity 1:1 a preservar.

Total: **9 findings** (0 CRIT / 0 MAJOR / 3 MEDIUM / 5 LOW / 1 INFO). Nenhum bug runtime — todas as observações são contract-shape / strict-mode / observabilidade.

---

### F-CR50-1 — `BillingPort.postReconciliation` sem `idempotencyKey` (MEDIUM)

**File:** `packages/usage-reconcile-worker/src/index.ts:45`
**Root cause:** `postReconciliation(records: readonly ReconciliationRecord[]): Promise<Result<void, AppError>>` não recebe nem expõe chave de idempotência. Em reconcile real, retry após falha de rede (timeout 5s da deadline ADR-0032) pode reenviar a mesma window e o backend grava duas vezes — double-write em billing é incidente financeiro, não bug recuperável. `ReconciliationRecord` também não carrega ID estável (poderia ser `${windowFromMs}-${windowToMs}-${userId ?? 'self'}` hashed).
**Fix:** Adicionar `readonly idempotencyKey: string` em `ReconciliationRecord` (derivado deterministicamente da window + tenant) **antes da impl real entrar** — assinatura pública é mais barata mudar agora. Documentar no JSDoc que backend deve dedup por essa chave (server-side ou via constraint UNIQUE). Alternativa: `postReconciliation(records, opts: { idempotencyKey: string })` se chave for por-batch.
**ADR:** 0011 (Result pattern — erros esperados são tipos; double-write é erro de domínio que merece prevenção estrutural, não exception).

### F-CR50-2 — `BillingPort.fetchUsageWindow` sem `AbortSignal` (MEDIUM)

**File:** `packages/usage-reconcile-worker/src/index.ts:41-46, 49-53`
**Root cause:** Métodos `fetchUsageWindow` (billing + local) retornam `Promise<Result<...>>` mas não aceitam `AbortSignal`. Em graceful shutdown (5s deadline, ADR-0032), `stop()` precisa cancelar requests HTTP em voo — sem signal, fetch fica detached, processo trava ou é SIGKILL'd antes do cleanup. Mesmo problema no `BillingPort.postReconciliation`.
**Fix:** Estender as três assinaturas com `signal?: AbortSignal` (terceiro param em `opts` ou parâmetro separado). Worker handle deve possuir `AbortController` e propagar via `bindToAbort` em `stop()`. Padrão já usado em `ClaudeAgent`/`OpenAIAgent`/`stream-runner`.
**ADR:** 0032 (graceful shutdown — signal → deadline → SIGKILL; toda chamada externa precisa de path de cancelamento) + 0012 (Disposable — `bindToAbort(d, signal)` é o helper canônico).

### F-CR50-3 — `UsageReconcileWorkerHandle` não compõe com `IDisposable` (MEDIUM)

**File:** `packages/usage-reconcile-worker/src/index.ts:73-78`
**Root cause:** Handle expõe `stop(): Promise<void>` ad-hoc, não implementa `IDisposable` (ADR-0012). `stop()` não compõe com `DisposableStore`/`combinedDisposable`/`bindToAbort` — caller no main precisa registrar handler manual ao invés de `this._register(worker)`. Quando impl real entrar, vai operar `setInterval` (timer) + `fetch` (network) + possivelmente subprocess — tudo recursos que ADR-0012 obriga a retornar disposer. Decidir agora evita rework do composition root depois.
**Fix:** Marcar `UsageReconcileWorkerHandle extends IDisposable` (de `@g4os/kernel`); `dispose()` substitui `stop()` (ou `stop()` chama `dispose()` internamente). Implementação real `extends DisposableBase` e usa `this._register(toDisposable(() => clearInterval(timer)))`.
**ADR:** 0012 (DisposableBase/IDisposable enforcado em qualquer classe que registre listener/timer/watcher/subprocess) + 0032 (graceful shutdown — cleanup encadeado via DisposableStore).

### F-CR50-4 — `start()` retorna `ErrorCode.UNKNOWN_ERROR` para estado bem-conhecido "skeleton" (LOW)

**File:** `packages/usage-reconcile-worker/src/index.ts:88, 99`
**Root cause:** `UNKNOWN_ERROR` é o catch-all para bugs/causas desconhecidas. Skeleton não-implementado é estado **conhecido e esperado** — perde a discriminabilidade que ADR-0011 prega ("erro silencioso = bug invisível"). Caller que faz `switch (err.code)` não consegue distinguir "feature gated por billing inexistente" de "throw genérico do SDK". Mesmo problema em `runOnce()`.
**Fix:** Adicionar `ErrorCode.FEATURE_NOT_AVAILABLE: 'feature.not_available'` (ou similar — `BILLING_NOT_CONFIGURED`) em `packages/kernel/src/errors/error-codes.ts` e usar nos dois retornos. Permite UI/Settings discriminar e mostrar "Habilite billing nas configurações" ao invés de toast genérico.
**ADR:** 0011 (Result pattern — códigos de erro canônicos são contrato, não free-form).

### F-CR50-5 — `divergenceToleranceP` é optional sob `exactOptionalPropertyTypes` (LOW)

**File:** `packages/usage-reconcile-worker/src/index.ts:37`
**Root cause:** Campo declarado `divergenceToleranceP?: number;`. Sob `exactOptionalPropertyTypes: true` (ADR-0002, `tsconfig.base.json:17`), `{ x?: T }` **não aceita** `{ x: undefined }` — só `{ x: T }` ou ausência da chave. Combinado com `_options` nunca lido, isso é cosmético hoje, mas vira armadilha quando impl real consumir o options (caller que faz `{ ...defaults, divergenceToleranceP: cfg.tolerance }` quando `cfg.tolerance === undefined` quebra o tipo).
**Fix:** Substituir por `readonly divergenceToleranceP: number | undefined` (explícito) ou aplicar default no factory e tipar como `readonly divergenceToleranceP: number`. Padrão já adotado em `AgentConfig`/`SourcesService` no mesmo repo.
**ADR:** 0002 (TS strict absoluto, `exactOptionalPropertyTypes`).

### F-CR50-6 — Contrato sem `CheckpointPort` para recovery após crash (LOW)

**File:** `packages/usage-reconcile-worker/src/index.ts:26-38`
**Root cause:** Worker é `setInterval(reconcile, intervalMs)` semântico — após crash/restart, sem checkpoint persistido ele não sabe qual foi a última window reconciliada com sucesso. Pode (a) rerodar tudo desde epoch (caro + duplicate writes mesmo com idempotência) ou (b) skipar windows pendentes (perda silenciosa de dados de cobrança). Contrato atual não tem `CheckpointPort { read(): Promise<Result<{ lastReconciledToMs: number }, ...>>; write(toMs): Promise<Result<void, ...>> }`.
**Fix:** Adicionar `CheckpointPort` em `UsageReconcileWorkerOptions`. Persistência via `writeAtomic` (ADR-0030 atomic writes em `@g4os/kernel/fs`). Documentar invariante: write do checkpoint **depois** de `postReconciliation` retornar `ok` — falha entre as duas é OK porque idempotency key (F-CR50-1) cobre o re-envio.
**ADR:** 0011 (Result no port) + 0032 (recovery após crash é parte do graceful lifecycle) + 0043 (event sourcing já usa pattern `(consumer_name, session_id) → checkpoint` — mesma família).

### F-CR50-7 — `UsageRecord.userId` é PII sem flag de scrubbing (LOW)

**File:** `packages/usage-reconcile-worker/src/index.ts:61`
**Root cause:** `readonly userId?: string` é PII — `docs/deferred/usage-reconcile-worker.md:33-35` explicitamente avisa: "`scrubSentryEvent` já filtra `email`, mas `userId` é fair game pra event sourcing → revisar antes de produção." Hoje o skeleton só declara o tipo, mas se record vazar para `logger.info({ record })` ou Sentry breadcrumb (ADR-0062), userId vai junto.
**Fix:** Marcar JSDoc com `@pii` tag (convenção a adotar) ou prefixar campo: `userIdHash?: string` (SHA-256 já-hashed pelo caller). `scrubObject` em `@g4os/observability/sentry/scrub.ts` deve aprender a chave. Adicionar comentário no contrato exigindo hash antes de assignment.
**ADR:** 0062 (Sentry scrub central — `scrubSentryEvent`/`scrubObject`/`scrubString`) + CLAUDE.md "Logs: sem PII".

### F-CR50-8 — Sem testes de contrato (LOW)

**File:** `packages/usage-reconcile-worker/` (ausência de `src/__tests__/`)
**Root cause:** `package.json` script `"test": "vitest run --passWithNoTests"` mascara ausência de qualquer teste. CLAUDE.md "Testing Strategy" exige Contract tests com **100% cobertura das procedures** — aplicável aqui porque `UsageReconcileWorkerHandle` é contrato público que vai congelar quando billing entrar. Mudar shape depois (e.g., adicionar `idempotencyKey` da F-CR50-1) sem teste é arriscado.
**Fix:** Adicionar `src/__tests__/contract.test.ts` validando: (a) `start()` retorna `err` com código discriminável; (b) `stop()` é idempotente (chamar 2x não throw); (c) `runOnce()` sem `start()` ainda retorna `err` consistente; (d) typecheck-only test usando `expectTypeOf` em `BillingPort`/`LocalUsagePort` (assinaturas estáveis).
**ADR:** N/A direto, mas CLAUDE.md "Testing Strategy" + "forcing functions > prosa" — gate vazio é sugestão, não regra.

### F-CR50-9 — `tsconfig.json` declara `types: ["node"]` sem uso (INFO)

**File:** `packages/usage-reconcile-worker/tsconfig.json:6`
**Root cause:** `"types": ["node"]` puxa `@types/node` para o pacote. `src/index.ts` não importa nada de `node:*` (puro tipos + `@g4os/kernel/errors` + `neverthrow`). Drift menor — quando impl real entrar (timers, fetch, possivelmente `node:http`) vai precisar; deixar agora é cabo solto. ADR-0153 (catalog) cobre versão, mas não obriga inclusão.
**Fix:** Remover `"types": ["node"]` até impl real precisar. `@types/node` permanece em `devDependencies` por consistência com o resto do monorepo. Quando F-CR50-2 (AbortSignal) entrar, re-adicionar — `AbortSignal` é DOM-spec mas Node 24 já tem em globals.
**ADR:** 0153 (catalog drift — manter `@types/node` versionado via catalog está correto; exclusão é só hygiene).

---

### Áreas cobertas

- Worker lifecycle (spawn/kill/exit/AbortSignal): F-CR50-2, F-CR50-3
- Reconciliation logic (idempotência/checkpoint/recovery): F-CR50-1, F-CR50-6
- Result pattern (ADR-0011): F-CR50-1, F-CR50-4, F-CR50-6
- Disposable (ADR-0012): F-CR50-3
- Graceful shutdown (ADR-0032): F-CR50-2, F-CR50-3, F-CR50-6
- TS strict (ADR-0002): F-CR50-5
- Logs/PII: F-CR50-7
- Tests: F-CR50-8
- Catalog drift (ADR-0153): F-CR50-9 (clean — sem drift, só hygiene)
- Boundary (kernel-only deps): clean ✓
- Network timeouts/retries/backoff: clean ✓ (skeleton, sem network)
- Atomic writes: clean ✓ (skeleton, sem persistência)
- Memory/queue bounded: clean ✓ (skeleton, sem queue)
- Race concorrência: clean ✓ (skeleton, sem state)
- TODO/FIXME/console.log/debugger: clean ✓ (zero ocorrências)
- V1 parity: N/A — V1 é Cloudflare Worker server-side, modelo distinto

### Top 3

1. **F-CR50-1** (MEDIUM) — `idempotencyKey` ausente; double-write em retry é incidente financeiro.
2. **F-CR50-2** (MEDIUM) — `AbortSignal` ausente nos ports; quebra graceful shutdown 5s deadline.
3. **F-CR50-3** (MEDIUM) — Handle não-IDisposable; rework forçado no composition root quando impl real entrar.
