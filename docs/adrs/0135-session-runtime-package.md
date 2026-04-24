# ADR 0135: @g4os/session-runtime — composition-agnostic turn execution

## Metadata

- **Numero:** 0135
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** Refactor pós-OUTLIER-09/10/11 (sem task dedicada)

## Contexto

Pós-OUTLIER-09, `apps/desktop/src/main/services/sessions/` acumulou ~977 LOC em 11 arquivos: tool-loop, tool-execution, tool-persist, turn-runner, turn-finalize, turn-events, turn-ops, mutations, event-log, errors, dispatcher-select. Mais `services/session-event-bus.ts` (148 LOC). O cap MAIN_LIMIT 6200 explodiu pra 7987.

Mas diferente de `permissions` (cap miss acessório), o grupo `sessions/*` representa o **núcleo da execução de um turn**: orquestração multi-iteração do loop tool-use, conversão Observable→Promise da agent stream, persistência de mensagens assistant/tool, event-bus pub/sub. É a camada de runtime que:

1. TurnDispatcher (in-process) e WorkerTurnDispatcher (utilityProcess-backed) compartilham integralmente.
2. Não depende de Electron/IPC diretamente — só de kernel types, agent interface, data repos, observability metrics, permissions.
3. Já estava 100% puro TS (sem `node:` nativo exceto `crypto`).

Deixar em main era tanto violação de thin-main quanto coupling incorreto — runtime de sessão não é "composition root".

## Opções consideradas

### Opção A: Mover pra `@g4os/agents/shared/session-runtime/`
**Contras:** cruiser rule `agents-interface-isolated` permite só kernel como dep. Session-runtime precisa de `@g4os/data/events`, `@g4os/ipc/server` (MessagesService type), `@g4os/observability/metrics`. Impossível.

### Opção B: Mover pra `@g4os/data/session-runtime/`
**Contras:** data é camada baixa (repos + migrations). Runtime agent-aware com rxjs/withSpan não pertence à camada de persistência. Inverte arquitetura.

### Opção C: Novo package `@g4os/session-runtime` (aceita)
**Descrição:**
- Nome reflete o escopo: "composition-agnostic turn execution runtime".
- Deps permitidas: `kernel`, `agents`, `data`, `ipc`, `observability`, `permissions`.
- Cruiser rule `session-runtime-layering` enforça.
- Re-exports:
  - `SessionEventBus` — pub/sub in-memory por sessionId (extends DisposableBase)
  - `runToolLoop`, `runAgentIteration`, `executeToolUses`, `persistAssistantToolTurn`, `persistToolResultMessage`
  - `finalizeAssistantMessage`, `buildMessageAddedEvent`, `forwardAgentEvent`
  - `appendCreatedEvent`, `appendLifecycleEvent`, `eventStoreReader`, `eventStoreWriter`
  - `lifecycleMutation`, `simpleMutation` (helpers Result-wrapping)
  - `respondPermission`, `stopTurn`, `notImplementedResult` (turn-ops)
  - Types `TurnDispatcherLike`, `SessionManagerLike` — interfaces estruturais que main implementa (main não importa do package as classes concretas)

## Decisão

**Opção C.** Package `@g4os/session-runtime` flat (sem subpaths) — 1 barrel com todos os exports. TurnDispatcher + WorkerTurnDispatcher + SessionsService consomem via `import { ... } from '@g4os/session-runtime'`.

## Consequências

### Positivas
- Main reduz 1125 LOC (977 sessions/* + 148 session-event-bus). Sozinho isso viabiliza main <6200 sem elevar gate.
- Runtime de turn vira testável isoladamente sem mock de Electron.
- Se amanhã aparecer um 3º dispatcher (ex: `RemoteTurnDispatcher` pra colab multi-user), reusa o mesmo runtime sem duplicação.
- `SessionManagerLike` + `TurnDispatcherLike` structural interfaces permitem test doubles triviais.

### Negativas / Trade-offs
- Mais um package pra lockfile/CI. Mitigado: extraído ao mesmo tempo que `@g4os/permissions` — uma única passagem de refactor.
- `dispatcher-select.ts` (23 LOC) ficou em main porque importa concretamente `TurnDispatcher` e `WorkerTurnDispatcher`. Main composition root (OK por design).
- `turn-ops.ts` `stopTurn()` originalmente recebia `SessionManager` + `AnyTurnDispatcher` concretos. Refactor exigiu trocar por interfaces estruturais `TurnDispatcherLike` + `SessionManagerLike`. Main agora passa via duck typing.

### Neutras
- `SessionEventBus` agora vive no package. Testes antigos em `apps/desktop/src/main/services/__tests__/` atualizaram import path (`@g4os/session-runtime`).

## Validação

- `check:main-size` 5976/6200 ✓
- `check:cruiser` `session-runtime-layering` enforçada (permite kernel/agents/data/ipc/observability/permissions; bloqueia platform/credentials/auth/sources/features/ui)
- Testes em `apps/desktop/src/main/services/__tests__/disposal-loop.test.ts` e `session-manager.integration.test.ts` continuam passando pós-import-rewrite.
- Cross-package tests próprios do runtime (tool-loop, broker gate, SessionEventBus dispose) vão em FOLLOWUP-14.

## Referencias

- ADR-0031 (main process thin layer)
- ADR-0012 (disposable pattern)
- ADR-0134 (@g4os/permissions)

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
