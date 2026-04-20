# ADR 0093: EntitlementService — dev bypass opt-in + onBypassUsed callback

## Metadata

- **Numero:** 0093
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-09-03 (epic 09-auth)

## Contexto

A v1 não tinha bypass de entitlement para desenvolvimento — CI e testes locais dependiam de conectividade real com Supabase. Qualquer PR sem credenciais configuradas no ambiente falhava (silenciosamente) na etapa de verificação de entitlement. Além disso, sem `onBypassUsed` callback, não havia como rastrear usos acidentais de bypass em ambiente de produção.

Requisitos:
- `EntitlementService` com `check(userId)` retornando `Result<Entitlements, AuthError>`
- `devBypass: true` via constructor option — **nunca** via `process.env` dentro do pacote
- `G4OS_DEV_ENTITLEMENT_BYPASS` lido pelo caller em `apps/desktop` e passado como option
- `onBypassUsed` callback para rastreamento (telemetria, log, alerta)
- `EntitlementClient` como porta DI — sem HTTP real nos testes de unit
- `DEV_ENTITLEMENTS` como constante de todos-habilitados para uso em bypass

## Opções consideradas

### Opção A: `process.env.G4OS_DEV_ENTITLEMENT_BYPASS` lido diretamente no pacote

**Rejeitada:** acoplamento ao ambiente de execução; impossível testar bypass sem manipular env; bug poten­cial de bypass acidental em produção se env vazar.

### Opção B: `devBypass` como constructor option + `onBypassUsed` callback (escolhida)

`EntitlementService` recebe `{ devBypass?: boolean; onBypassUsed?: () => void; client: EntitlementClient }`. Se `devBypass === true`, retorna `DEV_ENTITLEMENTS` imediatamente e chama `onBypassUsed?.()`. O caller (`apps/desktop`) lê `process.env` e passa como option.

### Opção C: feature flag via `@g4os/platform`

**Rejeitada:** overhead de camada de platform para um flag booleano simples; `@g4os/auth` ficaria dependente de `@g4os/platform`.

## Decisão

Opção B. `@g4os/auth/entitlement` exporta:

| Export | Papel |
|---|---|
| `EntitlementService` | `check(userId)` com devBypass + client DI |
| `EntitlementClient` | porta: `fetchEntitlements(userId)` → `Result<Entitlements, AuthError>` |
| `Entitlements` | shape: `{ plan, maxSessions, ... }` |
| `DEV_ENTITLEMENTS` | all-enabled para uso em bypass |

`apps/desktop` configura:
```ts
new EntitlementService({
  devBypass: process.env.G4OS_DEV_ENTITLEMENT_BYPASS === 'true',
  onBypassUsed: () => logger.warn('entitlement bypass ativo'),
  client: new SupabaseEntitlementClient(supabase),
});
```

## Consequências

**Positivas:**
- CI e testes locais funcionam sem conectividade Supabase via `devBypass: true`
- `onBypassUsed` permite detectar bypass acidental em staging via telemetria
- Boundary `auth → kernel` enforçada — sem `process.env` no pacote
- 4 testes: check success, check failure (network), check with bypass + callback, check without bypass

**Negativas:**
- Caller precisa ler `process.env` e passar — mais plumbing em `apps/desktop`

## Armadilhas preservadas da v1

1. Sem bypass para dev → CI depende de conectividade Supabase. v2: bypass opt-in por option.
2. Sem rastreamento de bypass → produção podia rodar com entitlements falsos. v2: `onBypassUsed` obrigatório para auditoria.

## Referências

- ADR-0011 (Result<T, E>)
- `STUDY/Audit/Tasks/09-auth/TASK-09-03-entitlement-check.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-09-03 landed).
