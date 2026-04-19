# ADR 0053: Credential rotation (handlers plugáveis + orchestrator DisposableBase)

## Metadata

- **Numero:** 0053
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead, @security
- **Task relacionada:** TASK-05-04 (epic 05-credentials)

## Contexto

Credenciais OAuth expiram. Na v1, refresh logic ficava espalhado em cada source; o resultado foi:
- Token expirado no meio do chat causava erro em runtime após horas de sessão.
- Cada source reimplementava a lógica — drift inevitável, cobertura de teste inconsistente.
- Não havia observabilidade central de quantos tokens estavam perto de expirar.

O vault v2 (ADR-0050) armazena `expiresAt`; precisamos de um mecanismo que use essa informação preventivamente.

## Opções consideradas

### Opção A: Refresh lazy (no momento do uso)
**Pros:** zero polling.
**Contras:** primeiro request após expiração falha; requer retry em toda camada que usa credencial.

### Opção B: Refresh eager per-source
**Pros:** sem coordenação central.
**Contras:** repete o problema da v1 — lógica espalhada, drift, zero observabilidade.

### Opção C: Orchestrator central + handlers plugáveis (aceita)
**Descrição:**
- Interface `RotationHandler { canHandle(key), rotate(currentValue): Promise<{newValue, expiresAt}> }`.
- `OAuthRotationHandler` genérico (RFC-6749 refresh_token grant) aceita qualquer key prefixada com `oauth.`; `fetch` injetável para testes.
- `RotationOrchestrator` estende `DisposableBase` (ADR-0012): `start()` começa `setInterval`, `dispose()` limpa o timer. Scan varre o vault, seleciona chaves com `expiresAt - now <= bufferMs` (default 5min), aciona o primeiro handler compatível.
- Falha em uma credencial não afeta as outras (try/catch por chave).
- Telemetria opcional: `setTelemetry({ onRotation, onScan })` para métricas futuras (`credential_rotation_total`, `credential_expiring_count`).

## Decisão

**Opção C.** Implementação em [`packages/credentials/src/rotation/`](../../packages/credentials/src/rotation/):

- [`handler.ts`](../../packages/credentials/src/rotation/handler.ts) — contrato.
- [`oauth-handler.ts`](../../packages/credentials/src/rotation/oauth-handler.ts) — implementação genérica.
- [`orchestrator.ts`](../../packages/credentials/src/rotation/orchestrator.ts) — loop + dispatch + dispose.

Defaults: `intervalMs = 5min`, `bufferMs = 5min`. Caller (bootstrap em `apps/desktop/src/main/*`) instancia com seus handlers e chama `start()` após login; `dispose()` no graceful shutdown (ADR-0032).

## Consequências

### Positivas
- Uma única implementação de refresh cobre todos os sources OAuth (e qualquer provider futuro que implemente `RotationHandler`).
- Telemetria centralizada — dashboard mostra quantos tokens estão perto de expirar sem instrumentar cada source.
- `DisposableBase` garante que o `setInterval` nunca vaza (teste regressivo cobre).

### Negativas / Trade-offs
- `setInterval` acopla ao clock do processo main. Aceitável — main é singleton, shutdown passa por `dispose()`.
- Handler precisa conhecer detalhes do provider (tokenUrl, clientId, clientSecret). Caller monta. Se provider mudar, substitui o handler.
- `rotateIfExpiring` lê o vault duas vezes (list + get). Aceitável para <100 credenciais/usuário, scan ~5min.

### Neutras
- `expiresAt` do vault é fonte de verdade — o orchestrator nunca mantém estado próprio de expiração. Reinícios do processo retomam sem perda.

## Validação

- 4 testes unitários (`rotation.test.ts`):
  - Rotaciona dentro da janela de buffer.
  - Não rotaciona fora da janela.
  - Isola falhas per-credencial (handler A falha, B continua).
  - `start()` retorna `IDisposable`; `dispose()` limpa sem vazar timer.

## Referencias

- ADR-0012 (Disposable), ADR-0032 (graceful shutdown), ADR-0050 (vault API)
- [RFC 6749 §6 — Refreshing an Access Token](https://datatracker.ietf.org/doc/html/rfc6749#section-6)
- `STUDY/Audit/Tasks/05-credentials/TASK-05-04-rotation.md`

---

## Histórico de alterações

- 2026-04-18: Proposta + aceita (TASK-05-04 landed)
