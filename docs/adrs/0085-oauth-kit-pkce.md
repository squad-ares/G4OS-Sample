# ADR 0085: OAuth Kit — PKCE S256 + deep-link + loopback server + token exchanger

## Metadata

- **Numero:** 0085
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @agents-team
- **Task relacionada:** TASK-08-05 (epic 08-sources-mcp)

## Contexto

A v1 tinha OAuth fragmentado por connector, sem PKCE em alguns flows (vulnerável a code interception) e deep-link handler frágil no Windows (o protocol não era re-registrado após update do app, causando callbacks perdidos). Loopback server inexistente como fallback.

Requisitos:
- PKCE S256 obrigatório quando provider suporta
- `OAuthCallbackHandler` acomodando deep-link (`g4os://oauth/callback`) como caminho primário
- Loopback server HTTP temporário como fallback cross-platform
- `performOAuth` como utilitário reutilizável por qualquer source ou managed connector
- State parameter (`randomBytes(16)`) previne CSRF
- Timeout configurável (default 5min) para invalidar callback pendente

## Opções consideradas

### Opção A: OAuth embutido em cada connector (status quo v1)

**Rejeitada:** duplicação, sem PKCE em vários flows, cada connector reinventando callback handling.

### Opção B: OAuth Kit como subpath `@g4os/sources/oauth` (escolhido)

Funções puras e classes injetáveis:

| Export | Papel |
|---|---|
| `generatePkce()` | verifier (+32 bytes random) + challenge S256 + method |
| `OAuthCallbackHandler` | `await(state, timeout)` → `URLSearchParams`; `handleDeepLink(url)` resolve pending |
| `startLoopbackServer(port)` | HTTP server temporário com `{ url, wait(), close() }` |
| `performOAuth(config, handler)` | flow completo: buildAuthUrl → openExternal → await callback → exchangeCode |
| `createFetchTokenExchanger(config)` | factory de token exchange HTTP sem dependência de SDK |

`OAuthCallbackHandler` vive em `apps/desktop` (acessa `shell.openExternal`) mas é testável via wiring fake.

### Opção C: biblioteca externa tipo `openid-client`

**Rejeitada:** overhead para um fluxo OTP + JWT simples; sem ganho de migração da v1; nova dep de produção sem ADR de beta.

## Decisão

Opção B. Funções puras + `OAuthCallbackHandler` injetável. Connectors chamam `performOAuth(config, handler)` sem saber de deep-link vs loopback — a seleção acontece no caller (`apps/desktop`).

`OAuthCallbackHandler.await(state, timeoutMs)` usa `Map<state, resolver>` — timeout limpa pending e rejeita a Promise. Sem event emitter global, sem race condition entre callbacks de flows simultâneos.

## Consequências

**Positivas:**
- PKCE garantido — zero code interception nas integrações
- Deep-link como primary, loopback como fallback — ambos testáveis sem browser real
- State CSRF previne callback hijacking entre flows paralelos
- Reutilizável por todos os 21 managed connectors + futuros API sources

**Negativas:**
- `shell.openExternal` fica em `apps/desktop` — o kit não pode iniciar o fluxo sem o caller passar o handler

**Neutras:**
- `randomBytes` de `node:crypto` — sem dep externa

## Armadilhas preservadas da v1

1. Deep-link não re-registrado em update Windows → callbacks perdidos. v2: `OAuthCallbackHandler` em singleton no main process, independente de URL scheme registration.
2. Sem PKCE em alguns flows → vulnerável. v2: `generatePkce()` chamado em todo `performOAuth`.

## Referências

- ADR-0084 (ManagedConnectorBase — usa OAuth kit)
- ADR-0051 (safeStorage — armazena refresh tokens trocados)
- ADR-0053 (Credential Rotation Orchestrator — rotaciona tokens OAuth)
- `STUDY/Audit/Tasks/08-sources-mcp/TASK-08-05-oauth-flows.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-08-05 landed).
