# @g4os/agents

Agent framework for G4 OS v2. Provides a common contract (`IAgent`) and independent implementations for each provider backend. All agents are `IDisposable` and stream typed `AgentEvent` via RxJS Observables.

## Subpath exports

| Subpath | Contents | ADR |
|---|---|---|
| `@g4os/agents/interface` | `IAgent`, `AgentFactory`, `AgentRegistry`, `AgentEvent` union, Zod schemas | 0070 |
| `@g4os/agents/claude` | `ClaudeAgent` (direct / Bedrock / compat), `createClaudeFactory` | 0071 |
| `@g4os/agents/codex` | `CodexAgent` (subprocess NDJSON), `createCodexFactory`, `resolveCodexBinary` | 0072 |
| `@g4os/agents/shared` | Broker: `McpPoolClient`, `SessionToolProfile`, `filterSessionTools`, `PermissionHandler`, `detectSourceAccessIssue`, `resolveThinkingConfig` | 0073 |
| `@g4os/agents/openai` | `OpenAIAgent`, `createOpenAIFactory` | 0074 |
| `@g4os/agents/google` | `GoogleAgent`, `createGoogleFactory` | 0075 |
| `@g4os/agents/streaming` | `StreamBackpressureController`, `StreamQueue` | 0076 |
| `@g4os/agents/permissions` | `PermissionPolicy`, `PermissionOrchestrator` | 0077 |

## Boundaries

`@g4os/agents/interface` and `@g4os/agents/shared` depend only on `@g4os/kernel`. Provider packages (`claude`, `codex`, `openai`, `google`) are isolated from each other — they communicate only through the `interface` contract. Enforced by `dependency-cruiser` (`agents-interface-isolated`).

## Key patterns

- **DI throughout.** SDK clients, subprocess spawners, binary resolvers, MCP pool clients — all injected. Tests never touch real network/subprocess.
- **AbortSignal propagation.** Every `send()` accepts a signal; `dispose()` aborts in-flight requests.
- **Lazy SDK imports.** `@anthropic-ai/sdk` and `openai` are dynamically imported at first use to keep startup fast and allow scaffolding without them installed.
- **Result<T, AgentError>.** `AgentRegistry.create()` and `resolve()` return `Result`; never throw on expected failures.

## shared broker

`@g4os/agents/shared` extracts ~600 LOC of session-tool/permission/source-activation logic that was duplicated in the V1 `PiAgent` monolith. OpenAI and Google agents import it instead of re-implementing. See ADR-0073.
