# Deferred: usage-reconcile-worker (TASK-18-07)

**Status:** ⏸️ Skeleton entregue — impl real adiada até backend de billing existir.

## Origem

V1 tinha worker que reconciliava tokens consumidos vs billing. V2 MVP é
single-user device-only — não cobra ninguém ainda, então o worker tem
zero ROI hoje.

## O que foi entregue

- Pacote `@g4os/usage-reconcile-worker` com:
  - Contratos `BillingPort` + `LocalUsagePort` (DI-ready).
  - Tipos `UsageRecord` + `ReconciliationRecord`.
  - `createUsageReconcileWorker()` factory que retorna `Result.err`
    explícito até impl real entrar.

Isso fixa a surface area pra que, quando billing entrar, a integração
seja só preencher `BillingPort` (HTTP client do Stripe ou custom) + ligar
no boot do main.

## Pré-requisitos pra promover a impl real

1. **Backend de billing existir.** Hoje não há.
2. **Decisão sobre frequência de reconcile.**
   - Real-time (alta carga, expensive).
   - Batch noturno (delay de cobrança até 24h).
   - On-demand quando user abre billing settings.
3. **Política de divergência.** Cliente reportou 1000 tokens, backend
   recebeu 980 — quem ganha? Tolerance default 5pp parece razoável mas
   precisa validação com finance.
4. **PII compliance.** UsageRecord pode anexar `userId` — cuidado pra
   não vazar pra logs/Sentry. `scrubSentryEvent` já filtra `email`, mas
   `userId` é fair game pra event sourcing → revisar antes de produção.

## Recomendação

Não tocar até billing v0 estar deployed. Skeleton suficiente pra
documentar intent + manter slot de package livre.

## Referências

- TASK-18-07 em `STUDY/Audit/Tasks/18-v1-parity-gaps/README.md`
- `packages/usage-reconcile-worker/src/index.ts`
- ADR-0064 — métricas (incl. `turn.tokens.total` que vira input do worker)
