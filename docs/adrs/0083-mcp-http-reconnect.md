# ADR 0083: McpHttpSource — SSE transport + backoff exponencial + needs_auth detection

## Metadata

- **Numero:** 0083
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead, @agents-team
- **Task relacionada:** TASK-08-03 (epic 08-sources-mcp)

## Contexto

MCP via HTTP/SSE não requer subprocess — é HTTP puro com streaming de eventos via Server-Sent Events. A v1 tinha reconnect sem backoff (storm de requests em falha) e não distinguia erros de auth (401/403) de erros de rede, resultando em loops infinitos de retry para credentials inválidas.

Requisitos:
- `McpHttpSource` com `SSEClientTransport`, inject de `Authorization` header
- Reconnect com backoff exponencial (max 5 tentativas, cap de 30s)
- `status$` → `needs_auth` em 401/403 (nunca auto-retria auth)
- Abort signal cancela chamadas de tool em progresso

## Opções consideradas

### Opção A: reconnect imediato sem backoff (status quo v1)

**Rejeitada:** storm de requests em cenário de falha de rede. v1 gerava picos de 100+ conexões simultâneas.

### Opção B: `withReconnect` como operador separado com backoff exponencial (escolhida)

`McpHttpSource` implementa `ISource` sem lógica de retry interna. Um operador separado `withReconnect(source)` subscreve `status$` e aplica:

```
status = 'disconnected' AND attempts < 5 → await backoff(2^attempts × 1000ms, max 30s) → activate()
status = 'connected' → reset attempts = 0
status = 'needs_auth' → NÃO retria (auth requer intervenção manual)
```

Separar reconnect da source permite testar cada um independentemente e usar a source sem retry (testes / uso manual).

### Opção C: retry interno na source

**Rejeitada:** acopla policy de retry ao transport. `ISource` fica com duas responsabilidades.

## Decisão

Opção B. `@g4os/sources/mcp-http` com:

| Módulo | Papel |
|---|---|
| `source.ts` | `McpHttpSource` — SSEClientTransport, `onclose`/`onerror` → status$ |
| `reconnect.ts` | `withReconnect(source)` — operador backoff exponencial, retorna `IDisposable` |
| `factory.ts` | `mcpHttpFactory` com `withReconnect` aplicado por default |

`skip(1)` no subscribe de `status$` ignora emissão replay inicial do `BehaviorSubject` (evita reconnect espúrio no attach).

`needs_auth` nunca auto-retria — `withReconnect` verifica status antes de tentar.

## Consequências

**Positivas:**
- Zero storm de requests — backoff exponencial com cap de 30s
- Auth errors distinguidos de network errors — nunca loop em credentials inválidas
- `withReconnect` é opcional — testes usam source diretamente

**Negativas:**
- Reconnect é externo — caller precisa lembrar de aplicar `withReconnect` em produção

## Armadilhas preservadas da v1

1. Reconnect sem backoff → storm. v2: `withReconnect` com `Math.min(30_000, 1000 * 2^attempts)`.
2. 401/403 misturado com disconnect → loop infinito. v2: `needs_auth` gating no reconnect.

## Referências

- ADR-0081 (ISource interface)
- ADR-0012 (IDisposable)
- `STUDY/Audit/Tasks/08-sources-mcp/TASK-08-03-mcp-http.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-08-03 landed).
