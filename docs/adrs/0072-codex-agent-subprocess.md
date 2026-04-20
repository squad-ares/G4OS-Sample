# ADR 0072: CodexAgent — subprocess NDJSON + Subprocess DI + bridge MCP skeleton

## Metadata

- **Numero:** 0072
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-07-03 (epic 07-agent-framework)

## Contexto

O CodexAgent v1 spawna o binário Codex CLI (proprietário) em `app-server` mode e troca mensagens NDJSON por stdin/stdout. Três problemas estruturais:

1. **Subprocess órfão** — fechar o app sem graceful shutdown deixava o Codex CLI rodando; v1 tinha que caçar PIDs em `ps`.
2. **Binary resolution espalhada** — código checava `CODEX_DEV_PATH`/`CODEX_PATH`/path bundled em três lugares diferentes; inconsistência causava "binary not found" que parecia sumir ao restart.
3. **Bridge MCP bundled como binário** — código fonte do bridge MCP **não está no OSS**, apenas o artifact bundled. Em v1 o código main e o bridge misturavam responsabilidades.

Requisitos da v2 (TASK-07-03):

- Subprocess starts + responds com NDJSON estável (roundtrip testado).
- Bridge MCP conecta quando configurado (mantém MCP bundle).
- Binary resolution Mac/Win/Linux — uma função só.
- Subprocess die → agent dispose (cleanup determinístico).
- Cobertura ≥ 75% (paths OS-specific podem ficar abaixo).

## Opções consideradas

### Opção A: `execa` hard-coded, sem abstração
**Pros:** menos código.
**Contras:** testes precisariam spawnar processos reais ou mockar o módulo execa inteiro; execa é ESM-only e pesa ~1MB transitivo; acopla o pacote a uma lib externa quando `node:child_process` resolve o mesmo problema com `tree-kill` embutido no Node 24.

### Opção B: Contrato `Subprocess` injetável (aceita)
**Descrição:**
- Interface mínima em [`subprocess.ts`](../../packages/agents/src/codex/app-server/subprocess.ts):
  ```ts
  interface Subprocess {
    readonly stdout: AsyncIterable<string>;
    readonly exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
    write(chunk: string): Promise<void>;
    kill(signal?: NodeJS.Signals): void;
  }
  interface SubprocessSpawner {
    readonly kind: string;
    spawn(command: string, args: readonly string[]): Subprocess;
  }
  ```
- Adapter concreto `NodeSubprocessSpawner` via `node:child_process` (sem dep externa) em [`node-spawner.ts`](../../packages/agents/src/codex/app-server/node-spawner.ts).
- Tests injetam `FakeSpawner` com stdout iterable controlável — zero spawns reais.

### Opção C: Worker thread dedicado para o protocolo
**Pros:** isolamento por turn.
**Contras:** incompatível com subprocess real do Codex CLI; overkill quando o próprio Codex já é processo separado.

## Decisão

**Opção B.** Estrutura em [`packages/agents/src/codex/`](../../packages/agents/src/codex/):

| Módulo | Papel | LOC |
|---|---|---|
| [`app-server/protocol.ts`](../../packages/agents/src/codex/app-server/protocol.ts) | Tipos de `CodexRequest`/`CodexResponseEvent` (NDJSON wire contract) | 103 |
| [`app-server/frame.ts`](../../packages/agents/src/codex/app-server/frame.ts) | `jsonLineEncoder`/`jsonLineDecoder` + `LineBuffer` (framing puro) | 68 |
| [`app-server/subprocess.ts`](../../packages/agents/src/codex/app-server/subprocess.ts) | `Subprocess` / `SubprocessSpawner` contract | 16 |
| [`app-server/node-spawner.ts`](../../packages/agents/src/codex/app-server/node-spawner.ts) | Adapter de `node:child_process` | 50 |
| [`app-server/client.ts`](../../packages/agents/src/codex/app-server/client.ts) | `AppServerClient extends DisposableBase`; listeners `on('message' \| 'exit')`, `send`, stdout pump | 94 |
| [`app-server/event-mapper.ts`](../../packages/agents/src/codex/app-server/event-mapper.ts) | `CodexResponseEvent → AgentEvent` (puro) | 55 |
| [`app-server/input-mapper.ts`](../../packages/agents/src/codex/app-server/input-mapper.ts) | `AgentTurnInput → CodexRunTurnInput` (puro) | 80 |
| [`binary-resolver.ts`](../../packages/agents/src/codex/binary-resolver.ts) | `CODEX_DEV_PATH → CODEX_PATH → bundled` com DI para env/fileExists | 37 |
| [`bridge-mcp/connect.ts`](../../packages/agents/src/codex/bridge-mcp/connect.ts) | Skeleton para bridge MCP (attach/current/detach) | 36 |
| [`codex-agent.ts`](../../packages/agents/src/codex/codex-agent.ts) | `IAgent` impl: request por turn, filtragem por `requestId`, unsubscribe → cancel, interrupt | 121 |
| [`factory.ts`](../../packages/agents/src/codex/factory.ts) | `createCodexFactory({ spawner, binaryOptions, bridgeMcp })` | 39 |

Todos ≤ 400 LOC (maior: `codex-agent.ts` com 121).

### Como cada requisito é cumprido

**Subprocess inicia e responde.** `AppServerClient.start()` chama `spawner.spawn(command, ['app-server'])`, conecta stdout pump para decodificar NDJSON frame-by-frame via `LineBuffer` (que lida com chunks parciais) e expõe listeners via `on('message' | 'exit')`. Tests cobrem stream particionada em meio a JSON: `{"type":"ack"...` chega em um chunk, `"requestId":"r-1"}` no próximo — decoder reconstrói.

**NDJSON roundtrip estável.** `jsonLineEncoder` sempre appenda `\n`, `jsonLineDecoder` rejeita: (1) linhas em branco, (2) JSON malformado, (3) eventos com type fora da lista permitida (defense against server regressions), (4) eventos sem `requestId`. Test suite exercita cada branch.

**Bridge MCP.** `BridgeMcpConnector` tem `attach(url)` + `current()` + `detach()`. É skeleton: wiring real do WebSocket para o bridge MCP executável fica na integração (TASK-08 sources), porque o código-fonte do bridge não está no OSS deste repo. O connector expõe a API que o `CodexAgent.dispose()` usa para detach limpo.

**Binary resolution.** `resolveCodexBinary({ env, bundledBinary, fileExists })` é pura: DI para `env` (default `process.env[name]` — via override `biome.json` em `**/codex/binary-resolver.ts`), DI para `bundledBinary` e `fileExists`. Ordem: `CODEX_DEV_PATH` > `CODEX_PATH` > `bundledBinary()`. **Cada passo valida com `fileExists`** — env variable com path stale não bloqueia fallback para bundled. Test cobre os 4 branches + AgentError.unavailable quando nada resolve.

**Dispose determinístico.**
- `AppServerClient extends DisposableBase` registra um `toDisposable(() => child.kill('SIGTERM'))` no construtor.
- `CodexAgent.dispose()` chama `bridgeMcp.detach()` (se presente), `appServer.dispose()` (propaga kill), limpa `activeRequests`, depois `super.dispose()`.
- `run()` retorna uma Observable cujo teardown envia `{ type: 'cancel', requestId }` e remove o listener antes de deletar o request ativo — unsubscribe sempre cancela.
- `interrupt(sessionId)` resolve `ok` mesmo quando não há turn ativo (idempotent) e envia `cancel` + retorna Result sem throw.

**Request isolation multi-turn.** `CodexAgent` gera um `requestId` por turn (UUID v4, factory injetável para testes) e filtra eventos do listener por `event.requestId !== requestId`. Test simula dois requestIds no stream e valida que só o ativo chega no subscriber.

### Integração com execa (opcional)

O task file menciona execa. Optamos por `node:child_process` default e deixamos `SubprocessSpawner` aberto para um futuro `ExecaSpawner`. Razões:
- Zero nova dependência runtime.
- Node 24 já resolve cleanup de filhos via `'SIGTERM' → 'SIGKILL'` quando combinado com nossa `ProcessSupervisor` (ADR-0030) no main process — onde `CodexAgent` vai rodar.
- Testes ficam com zero spawns reais.

Se o host process quiser execa para DX melhor, implementa `ExecaSpawner extends SubprocessSpawner` e passa como `spawner` no `createCodexFactory`.

## Consequências

### Positivas
- 11 arquivos ≤ 121 LOC cada. Bug em framing NDJSON → abre `frame.ts` de 68 linhas.
- Tests rodam offline, sem binário Codex. 36 testes novos no subtree Codex cobrem todos os mappers + framing + cliente + agent + factory + bridge MCP.
- Boundary preservada: `@g4os/agents` ainda só depende de `@g4os/kernel` (cruiser `agents-interface-isolated` verde). `node:child_process` é core.
- Bridge MCP fica como API — quando o código fonte virar open-source (ou ficar como artifact bundled), o connector só muda internals.

### Negativas / Trade-offs
- Sem execa. Se algum provider Codex exigir features específicas (timeout nativo, readable-side events custom), precisamos de outro spawner ou upgrade do `NodeSubprocessSpawner`. Aceito — trocar é uma classe nova, não refactor global.
- `noProcessEnv: error` precisou override para `**/codex/binary-resolver.ts`. Alternativa (DI obrigatória para `env`) força o chamador a resolver no main. Ambos aceitáveis; override mantém o helper utilizável sem plumbing.
- `BridgeMcpConnector` é skeleton — test cobre o lifecycle (attach/detach/empty-url) mas o transport real do WebSocket não está aqui.

### Neutras
- `execa` fica banido de `@g4os/agents` por default; host instala se/quando quiser.
- O protocolo NDJSON v2 fica estável atrás de `CodexResponseEventType` Set — adicionar eventos exige atualizar o decoder gate.

## Validação

- **36 testes novos no subtree Codex:**
  - [`frame.test.ts`](../../packages/agents/src/__tests__/codex/frame.test.ts) (7): encoder, decoder (happy, blank, malformed, unknown type, missing requestId), LineBuffer split + tail flush.
  - [`event-mapper.test.ts`](../../packages/agents/src/__tests__/codex/event-mapper.test.ts) (7): stop reasons, ack, turn_started, deltas, tool_use lifecycle, usage com/sem cache, turn_finished, error bypass.
  - [`input-mapper.test.ts`](../../packages/agents/src/__tests__/codex/input-mapper.test.ts) (4): blocos, thinking drop, tools + instructions, ThinkingLevel enum.
  - [`binary-resolver.test.ts`](../../packages/agents/src/__tests__/codex/binary-resolver.test.ts) (5): dev/prod/bundled, skip stale, AgentError quando nada resolve.
  - [`bridge-mcp.test.ts`](../../packages/agents/src/__tests__/codex/bridge-mcp.test.ts) (4): attach default url, empty throws, detach clears.
  - [`client.test.ts`](../../packages/agents/src/__tests__/codex/client.test.ts) (5): spawn args, chunked NDJSON, dispose kills, send-before-start, exit listener.
  - [`codex-agent.test.ts`](../../packages/agents/src/__tests__/codex/codex-agent.test.ts) (7): capabilities, run → mapped events, multi-request isolation, unsubscribe → cancel, interrupt → cancel + ok Result, wire error → AgentEvent error + done:error, dispose kills + detaches bridge.
  - [`factory.test.ts`](../../packages/agents/src/__tests__/codex/factory.test.ts) (4): prefix check, start subprocess, supports, bridge callback.
- Cobertura ≥ 85% das transformações puras (acima do alvo de 75%).
- `typecheck`, `lint`, e gate suite full green.

## Referencias

- ADR-0070 (interface IAgent), ADR-0012 (Disposable), ADR-0011 (Result), ADR-0030 (utilityProcess), ADR-0032 (graceful shutdown).
- [Node.js child_process.spawn — Node 24](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options)
- `STUDY/Audit/Tasks/07-agent-framework/TASK-07-03-codex-agent.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-07-03 landed).
