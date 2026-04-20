# ADR 0084: ManagedConnectorBase — decomposição do God File de 1991 LOC

## Metadata

- **Numero:** 0084
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead, @agents-team
- **Task relacionada:** TASK-08-04 (epic 08-sources-mcp)

## Contexto

`managed-connectors.ts` da v1 tinha **1991 linhas** combinando 21 integrações (Gmail, Drive, Slack, GitHub, etc.) em um único arquivo via Pipedream. Cada connector reimplementava OAuth callback, token storage e retry sem contrato compartilhado. Deep-link callback era frágil no Windows (protocol não registrado após update).

Requisitos:
- Cada connector em pacote isolado ≤ 500 LOC implementando `ISource`
- Base compartilhada `ManagedConnectorBase` gerenciando OAuth lifecycle
- `TokenStore` contract mirror de `CredentialVault` — sem importar `@g4os/credentials` dentro de `@g4os/sources`
- Deep-link callback consolidado via `OAuthCallbackHandler`

## Opções consideradas

### Opção A: refatorar o God File mantendo um único arquivo por vendor

**Rejeitada:** mantém acoplamento e dificulta adicionar novos connectors sem tocar o arquivo central. Boundary de dependência continua vaga.

### Opção B: 21 pacotes isolados + `ManagedConnectorBase` compartilhada (escolhida)

Hierarquia:
```
@g4os/sources/managed   → ManagedConnectorBase, TokenStore (contract)
@g4os/sources/managed-gmail   → GmailConnector extends ManagedConnectorBase
@g4os/sources/managed-github  → GitHubConnector extends ManagedConnectorBase
... (21 total)
```

`ManagedConnectorBase extends DisposableBase implements ISource`:
- `activate()` → verifica token → se ausente, emite `needs_auth`
- `authenticate()` → OAuth flow via `performOAuth` (ADR-0085)
- Subclasses implementam apenas `providerSlug`, `scopes`, `authEndpoint`, `connectProvider(token)` e `listTools()`

`TokenStore` é um contrato (`interface`) — implementação real (`CredentialVault`-backed) fica em `apps/desktop`.

### Opção C: abstração só no topo com `IntegrationManager` único

**Rejeitada:** volta para God Object. Impede split por vendor.

## Decisão

Opção B. Cada connector especializa apenas 4–5 métodos; `ManagedConnectorBase` garante que OAuth, status e dispose são consistentes entre todos os 21.

Auto-seed em workspaces novos: `apps/desktop` chama `seedManagedConnectors(registry)` que registra todos os factories em um único ponto.

## Consequências

**Positivas:**
- God File de 1991 LOC → 21 pacotes ≤ 500 LOC cada
- Novo connector = 1 pacote novo, zero churn nos outros
- Deep-link callback consolidado — sem race em update Windows

**Negativas:**
- 21 pacotes exige disciplina de versioning e boundary review por PR
- `TokenStore` wiring fica em `apps/desktop` — PR de integração separado

**Neutras:**
- Pipedream continua como transport de managed; substituição futura muda só o base, não os 21 connectors

## Armadilhas preservadas da v1

1. `managed-connectors.ts` 1991 linhas — God File. v2: 21 pacotes.
2. Callback handler frágil no Windows. v2: deep-link registrado via `OAuthCallbackHandler` consolidado (ADR-0085).

## Referências

- ADR-0081 (ISource interface)
- ADR-0085 (OAuth kit — PKCE + deep-link + loopback)
- ADR-0012 (DisposableBase)
- `STUDY/Audit/Tasks/08-sources-mcp/TASK-08-04-managed-connectors.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-08-04 landed).
