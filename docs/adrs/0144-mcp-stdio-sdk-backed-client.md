# ADR 0144: `McpClient` SDK-backed (lazy `@modelcontextprotocol/sdk`)

## Metadata

- **Numero:** 0144
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** FOLLOWUP-OUTLIER-12 (slice 4 — real client)
- **Depende de:** ADR-0081 (`@g4os/sources` ISource + MCP stdio interface), ADR-0143 (probe distinto do client)

## Contexto

`@g4os/sources/mcp-stdio` define o contrato `McpClient` (`connect` / `listTools` / `callTool` / `close`) e `McpStdioSource` já consome esse contrato no lifecycle. O que faltava era uma implementação concreta — `McpClientFactory` só tinha implementações de teste, então ativar um source stdio no broker de produção não funcionava.

A pergunta de design: onde mora o wrapper real do SDK?

Restrições:

1. `@g4os/sources` não pode depender em hard import de `@modelcontextprotocol/sdk` — pacote tem que continuar importável em contextos sem o SDK instalado (tests do próprio `@g4os/sources`, scaffolding, tooling).
2. O wrapper tem que ser testável sem spawnar subprocesso de verdade — o SDK real spawna, o que é frágil em CI.
3. O broker da sessão precisa poder injetar clientInfo / metadata próprio (telemetry, logs) sem forkar o wrapper.

## Opções consideradas

### Opção A: Hard import de `@modelcontextprotocol/sdk` em `@g4os/sources`

**Contras:** amarra o pacote ao peer, quebra imports em testes/scaffolding e em contextos renderer. Boundary `sources` vira "sources + SDK pra sempre".

### Opção B: Factory em `@g4os/desktop` com SDK hardcoded

**Contras:** duplica em cada app que precise do stdio real. Move lógica de protocolo MCP para fora do pacote responsável pelo protocolo MCP — viola single-source-of-truth.

### Opção C: Factory em `@g4os/sources` com `loadSdk` injetável + default de dynamic import (aceita)

**Descrição:**

- `packages/sources/src/mcp-stdio/sdk-client.ts` — expõe `createSdkMcpClientFactory({ loadSdk?, clientInfo? })`.
- `loadSdk` default: `Promise.all([import('@modelcontextprotocol/sdk/client/index.js'), import('@modelcontextprotocol/sdk/client/stdio.js')])` e retorna um `SdkBindings` com `createClient` + `createStdioTransport`.
- `SdkClientLike` expõe apenas a superfície mínima usada (`connect` / `listTools` / `callTool` / `close`) — cast explícito no loader, sem vazar tipos do SDK para fora do módulo.
- `SdkMcpClient` implementa `McpClient`: `callTool` retorna `Observable<ToolResult>` envolvendo a Promise do SDK (single-emission + complete, com `AbortSignal` hook para cancelamento cooperativo).
- Tests usam `loadSdk: async () => bindings` com um `SdkClientLike` stubbed — nenhum subprocesso envolvido.

## Decisão

**Opção C.** Dynamic import + DI factory mantém o contrato em `@g4os/sources`, não adiciona dep hard e é 100% testável sem spawn.

## Consequências

### Positivas

- `@g4os/sources` ganha uma implementação real do `McpClient` sem quebrar a regra "sources sem hard dep no SDK".
- 9 testes unitários cobrem connect (OK/erro-no-load/erro-no-connect), listTools (mapping/not-connected), callTool (emit/erro/not-connected), close (idempotência).
- Quando o broker da sessão estiver pronto (FOLLOWUP-OUTLIER-12 Phase 2), basta o main desktop chamar `createSdkMcpClientFactory()` e injetar na `McpStdioSource` existente — zero refactor de `ISource`/`SourceRegistry`.

### Negativas / Trade-offs

- `loadSdk` default assume que o SDK está em `node_modules` do consumidor; contexto renderer (browser/Vite) que tentar usar o default vai estourar — aceitável porque o broker roda em main/worker, não em renderer.
- `SdkClientLike` duplica uma fatia dos tipos do SDK. Aceito — isola nosso código de mudanças no surface SDK, só `defaultLoadSdk` precisa se atualizar se o SDK mudar.
- Vide ADR-0143: continuam existindo duas superfícies para stdio (probe leve vs client real). Probe sobrevive porque "binário starta e responde a `initialize`" é pergunta diferente de "mantém conexão viva e fala tool calls". Consolidação pode ser revista quando o broker live chegar.

### Neutras

- `clientInfo` default é `{ name: 'g4os', version: '0.0.1' }` — o main desktop deve sobrescrever com a versão real do app.

## Validação

- `pnpm --filter @g4os/sources test` — 60 testes verdes (9 novos em `mcp-stdio-sdk-client.test.ts`).
- `pnpm --filter @g4os/sources typecheck` / `lint` — verdes.
- `check:circular` — 0 ciclos. Boundary `sources-layering` respeitado (sdk-client depende só de `types.ts` e `interface/source.ts` mais `neverthrow`/`rxjs`).

## Referencias

- `packages/sources/src/mcp-stdio/sdk-client.ts` — implementação.
- `packages/sources/src/__tests__/mcp-stdio-sdk-client.test.ts` — testes.
- `packages/sources/src/mcp-stdio/types.ts` — contrato `McpClient` / `McpClientFactory` / `McpStdioConfig` (ADR-0081).
- `packages/sources/src/mcp-stdio/source.ts` — `McpStdioSource` consumidor (ADR-0081).
- ADR-0143 — probe leve, distinto desse client.

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
