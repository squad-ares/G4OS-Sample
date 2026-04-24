# ADR 0062: Sentry para crash reporting (scrub centralizado + lazy init)

## Metadata

- **Numero:** 0062
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @security
- **Task relacionada:** TASK-06-03 (epic 06-observability)

## Contexto

v1 já usa `@sentry/electron`. Problemas observados:
1. `beforeSend` inconsistente entre main e renderer — credenciais em `request.data` chegaram ao painel Sentry mais de uma vez.
2. Sentry iniciava mesmo em CI (sem DSN) — poluía logs com warnings.
3. Nenhuma deduplicação entre Sentry + pino + OTel — trace_id não aparecia no evento Sentry, dificultando correlacionar.

v2 precisa de:
1. `beforeSend` único, reutilizável em main/renderer/worker.
2. SDK como dependência **opcional**: sem DSN, retorna NOOP.
3. Redação agressiva de valores tipo `sk-*`, `AIza*`, JWTs — aplicada também em `beforeBreadcrumb`.

## Opções consideradas

### Opção A: Sentry hosted + config inline por processo
**Pros:** simples.
**Contras:** repete o problema v1 — cada processo implementa `beforeSend` à sua maneira.

### Opção B: Backend alternativo (Bugsnag, Rollbar)
**Pros:** viável.
**Contras:** perda do stack já treinado em v1; custo extra de migração de UI.

### Opção C: Sentry + wrapper `@g4os/observability/sentry` (aceita)
**Descrição:**
- `initSentry(options)` em [`packages/observability/src/sentry/init.ts`](../../packages/observability/src/sentry/init.ts):
  - Se `dsn` ausente → NOOP `{ close, setUser, setTag }` e log `sentry disabled`.
  - Senão, `await import(/* @vite-ignore */ resolveSpecifier(process))`: `@sentry/electron/main`, `@sentry/electron/renderer`, ou `@sentry/node` (worker).
  - `beforeSend` e `beforeBreadcrumb` usam `scrubSentryEvent(event)`, deep-scrub pura (não muta o input), com circular-safe `WeakSet`.
- `scrubSentryEvent` aplica `SCRUB_KEYS` (chaves sensíveis) e `SECRET_VALUE_PATTERNS` (regex para `sk-`, `AIza`, JWT).
- Renderer recebe `replaysSessionSampleRate` (0.05) + `replaysOnErrorSampleRate` (1.0) como defaults.

## Decisão

**Opção C.** SDKs em devDependencies dos consumidores do Electron (apps/desktop); `@g4os/observability` declara só tipos locais (`SentryEventLike`). Bootstrap chama `initSentry({ dsn, release, environment, process })` depois do Pi/auth boot.

## Consequências

### Positivas
- Uma regra de redação; bug de leak vira fix de **uma função** (`scrubObject`).
- CI e builds sem DSN configurado simplesmente não carregam o SDK — build menor + zero warnings.
- `setUser`/`setTag` expostos no handle permitem enriquecer eventos com `workspaceId`, `sessionId`, `traceId` vindos de OTel sem acoplar ao SDK.

### Negativas / Trade-offs
- `beforeSend` roda no hot path de erros; scrub é síncrono, depth-limited. Aceitável — alternativa (async) adicionaria fila interna e aumenta risco de perder eventos em crash.
- `scrubSentryEvent` não evita vazamento em campos customizados adicionados por instrumentation de terceiros. Mitigado por `scrubString(request.data)` em `beforeBreadcrumb`.

### Neutras
- Replay sessions no renderer é opt-out via sample rate 0 se necessário por compliance; default conservador.

## Validação

- 9 testes (`packages/observability/src/__tests__/scrub.test.ts`): profundidade, arrays, circular refs, chaves case-insensitive, padrões OpenAI/Google/JWT, `scrubSentryEvent` immutabilidade, breadcrumb paths.

## Referencias

- [Sentry — beforeSend](https://docs.sentry.io/platforms/javascript/configuration/filtering/#using-before-send)
- [Sentry Electron](https://docs.sentry.io/platforms/javascript/guides/electron/)
- `STUDY/Audit/Tasks/06-observability/TASK-06-03-sentry.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-06-03 landed)
