# @g4os/sources

Source / MCP integration layer for G4 OS v2. Provides a unified `ISource` contract for all external integrations (MCP stdio, MCP HTTP/SSE, managed connectors, OAuth-backed APIs) and a `SourceLifecycleManager` that centralises intent detection, sticky/rejected session state, and brokered activation.

## Subpath exports

| Subpath | Contents | ADR |
|---|---|---|
| `@g4os/sources/interface` | `ISource`, `SourceMetadata`, `SourceStatus`, `SourceRegistry`, `SourceFactory` | 0081 |
| `@g4os/sources/mcp-stdio` | `McpStdioSource`, `McpClientFactory`, `resolveRuntimeMode` (auto/protected/compat policy) | 0082 |
| `@g4os/sources/mcp-http` | `McpHttpSource`, `McpHttpClientFactory`, `withReconnect` (exponential backoff, skip initial replay) | 0083 |
| `@g4os/sources/managed` | `ManagedConnectorBase`, `TokenStore` | 0084 |
| `@g4os/sources/oauth` | PKCE S256, `OAuthCallbackHandler` (deep-link + loopback), `performOAuth`, `createFetchTokenExchanger` | 0085 |
| `@g4os/sources/lifecycle` | `SourceIntentDetector` (explicit/mention/skill/soft), `SourceLifecycleManager` (planTurn + activateBrokered + sticky/rejected per session) | 0086 |

## Boundaries

`@g4os/sources` depends only on `@g4os/kernel`. It never imports `@modelcontextprotocol/sdk`, `electron`, or `@g4os/credentials` directly — those are injected by `apps/desktop` via the `McpClientFactory` and `TokenStore` contracts. Enforced by `dependency-cruiser`.

## Key patterns

- **`ISource extends IDisposable`** — every implementation uses `DisposableBase`; no resource leak possible.
- **`BehaviorSubject<SourceStatus>`** — status is always reactive; no sync polling.
- **`Result<T, SourceError>`** — errors travel as types, never thrown on the happy path.
- **Runtime mode policy** — MCP stdio defaults to `protected` (isolated subprocess); falls back to `compat` (host) on Windows or when the source requires browser-auth. See `resolveRuntimeMode`.
- **Reconnect** — MCP HTTP uses `skip(1)` on reconnect to ignore the BehaviorSubject replay, then exponential backoff. `needs_auth` is never auto-retried.

## Adding a new source

1. Implement `ISource` (extend `DisposableBase`).
2. Write a `SourceFactory` function accepting injected runtime deps.
3. Register in `SourceRegistry` at desktop startup.
4. No changes needed in `SessionManager` or `AgentRegistry`.
