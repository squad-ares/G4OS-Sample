# @g4os/agents

Framework de agentes para o G4 OS v2. Fornece um contrato comum (`IAgent`) e implementações independentes por provedor. Todos os agentes são `IDisposable` e transmitem `AgentEvent` tipados via Observables RxJS.

## Sub-paths de importação

| Subpath | Conteúdo | ADR |
|---|---|---|
| `@g4os/agents/interface` | `IAgent`, `AgentFactory`, `AgentRegistry`, união `AgentEvent`, schemas Zod | 0070 |
| `@g4os/agents/claude` | `ClaudeAgent` (direct / Bedrock / compat), `createClaudeFactory` | 0071 |
| `@g4os/agents/codex` | `CodexAgent` (subprocess NDJSON), `createCodexFactory`, `resolveCodexBinary` | 0072 |
| `@g4os/agents/shared` | Broker: `McpPoolClient`, `SessionToolProfile`, `filterSessionTools`, `PermissionHandler`, `detectSourceAccessIssue`, `resolveThinkingConfig` | 0073 |
| `@g4os/agents/openai` | `OpenAIAgent`, `createOpenAIFactory` | 0074 |
| `@g4os/agents/google` | `GoogleAgent`, `createGoogleFactory` | 0075 |
| `@g4os/agents/streaming` | `StreamBackpressureController`, `StreamQueue` | 0076 |
| `@g4os/agents/permissions` | `PermissionPolicy`, `PermissionOrchestrator` | 0077 |

## Fronteiras

`@g4os/agents/interface` e `@g4os/agents/shared` dependem apenas de `@g4os/kernel`. Pacotes de provedor (`claude`, `codex`, `openai`, `google`) são isolados entre si — conversam somente via o contrato `interface`. Garantido pelo `dependency-cruiser` (`agents-interface-isolated`).

## Padrões principais

- **DI em todos os pontos.** Clientes de SDK, spawners de subprocess, resolvers de binário, clientes de pool MCP — todos injetados. Testes nunca tocam em rede/subprocess reais.
- **Propagação de `AbortSignal`.** Todo `send()` aceita um signal; `dispose()` aborta requisições em voo.
- **Imports lazy de SDKs.** `@anthropic-ai/sdk` e `openai` são importados dinamicamente no primeiro uso, mantendo o startup rápido e permitindo scaffolding sem eles instalados.
- **`Result<T, AgentError>`.** `AgentRegistry.create()` e `resolve()` retornam `Result`; nunca lançam em falhas esperadas.

## Broker compartilhado

`@g4os/agents/shared` extrai ~600 LOC de lógica de session-tool/permissões/ativação de source que era duplicada no monolito `PiAgent` da V1. Agentes OpenAI e Google importam em vez de reimplementar. Ver ADR-0073.
