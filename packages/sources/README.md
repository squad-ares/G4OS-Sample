# @g4os/sources

Camada de Sources/MCP do G4 OS v2. Fornece um contrato `ISource` unificado para todas as integrações externas (MCP stdio, MCP HTTP/SSE, managed connectors, APIs com OAuth) e um `SourceLifecycleManager` que centraliza detecção de intenção, estado sticky/rejected por sessão e ativação via broker.

## Sub-paths de importação

| Subpath | Conteúdo | ADR |
|---|---|---|
| `@g4os/sources/interface` | `ISource`, `SourceMetadata`, `SourceStatus`, `SourceRegistry`, `SourceFactory` | 0081 |
| `@g4os/sources/mcp-stdio` | `McpStdioSource`, `McpClientFactory`, `resolveRuntimeMode` (política auto/protected/compat) | 0082 |
| `@g4os/sources/mcp-http` | `McpHttpSource`, `McpHttpClientFactory`, `withReconnect` (backoff exponencial, skip do replay inicial) | 0083 |
| `@g4os/sources/managed` | `ManagedConnectorBase`, `TokenStore` | 0084 |
| `@g4os/sources/oauth` | PKCE S256, `OAuthCallbackHandler` (deep-link + loopback), `performOAuth`, `createFetchTokenExchanger` | 0085 |
| `@g4os/sources/lifecycle` | `SourceIntentDetector` (explicit/mention/skill/soft), `SourceLifecycleManager` (planTurn + activateBrokered + sticky/rejected por sessão) | 0086 |

## Fronteiras

`@g4os/sources` depende apenas de `@g4os/kernel`. Nunca importa `@modelcontextprotocol/sdk`, `electron` ou `@g4os/credentials` diretamente — essas são injetadas pelo `apps/desktop` via `McpClientFactory` e `TokenStore`. Garantido por `dependency-cruiser`.

## Padrões principais

- **`ISource extends IDisposable`** — toda implementação usa `DisposableBase`; sem vazamento de recursos.
- **`BehaviorSubject<SourceStatus>`** — status sempre reativo; sem polling síncrono.
- **`Result<T, SourceError>`** — erros esperados são tipos, nunca throw no caminho feliz.
- **Política de runtime mode** — MCP stdio tem default `protected` (subprocess isolado); cai para `compat` (host) em Windows ou quando a source exige browser-auth. Ver `resolveRuntimeMode`.
- **Reconnect** — MCP HTTP usa `skip(1)` no reconnect para ignorar o replay do BehaviorSubject, depois backoff exponencial. `needs_auth` nunca é auto-retriado.

## Módulos implementados mas não wired no desktop (FOLLOWUP-OUTLIER-12)

Os módulos abaixo estão completos, testados e exportados, mas o `apps/desktop` ainda não instancia nem registra no composition root:

| Módulo | Status | Próximo passo |
|---|---|---|
| `@g4os/sources/oauth` (`OAuthCallbackHandler`, `performOAuth`, `createFetchTokenExchanger`) | Implementado + 36 testes | Registrar handler no protocolo `g4os://oauth/callback` em `apps/desktop/src/main/index.ts` |
| `@g4os/sources/managed` (`ManagedConnectorBase`, `TokenStore`) | Implementado + 9 testes | Criar connectors concretos (Gmail, GitHub, etc.) com `OAuthConfig` e `TokenStore` real via `CredentialVault` |
| `@g4os/sources/lifecycle` (`SourceLifecycleManager`, `SourceIntentDetector`) | Implementado + testes | Wire `SourceLifecycleManager.planTurn` no `TurnDispatcher` (hoje usa `planTurn` pura de `@g4os/sources/planner`) |
| `@g4os/sources/interface` (`SourceRegistry`) | Implementado | Wire global registry no `apps/desktop` para managed connectors (MCP stdio já usa `McpMountRegistry` diretamente) |
| `@g4os/sources/mcp-http` (`withReconnect`) | Implementado + testado | Wire em `createMcpHttpFactory` no composition root do desktop |

Rastreado em: `FOLLOWUP-OUTLIER-12` / ADRs 0084, 0085, 0086.

## Como adicionar uma source nova

1. Implemente `ISource` (estendendo `DisposableBase`).
2. Escreva um `SourceFactory` aceitando deps de runtime injetadas.
3. Registre no `SourceRegistry` no startup do desktop.
4. Nenhuma mudança no `SessionManager` ou `AgentRegistry` é necessária.
