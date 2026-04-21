# ADR 0082: McpStdioSource — supervisor + protected/compat runtime mode

## Metadata

- **Numero:** 0082
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @agents-team
- **Task relacionada:** TASK-08-02 (epic 08-sources-mcp)

## Contexto

G4 OS v1 spawnava subprocessos MCP stdio de forma ad-hoc, sem supervisor dedicado. Três consequências diretas:

1. **Subprocessos órfãos** — fechar o app sem graceful shutdown deixava MCPs rodando em background consumindo memória.
2. **Sem memory limit** — MCPs de terceiros conhecidos vazam até GB sem capping; v1 não tinha policy.
3. **Protected mode no Windows** — `utilityProcess` forçado em Windows quebrava MCPs que exigiam acesso a filesystem de host; não havia detecção automática.

Requisitos da v2 (TASK-08-02):
- `McpStdioSource` supervisionado via `ProcessSupervisor` (ADR-0030)
- Política `auto → protected` exceto Windows ou `needsBrowserAuth` → `compat`
- Memory limit 300MB enforçado pelo supervisor
- Restart on-crash com máximo 3 tentativas
- `DisposableBase`: dispose fecha client MCP e mata subprocess

## Opções consideradas

### Opção A: spawn direto via `node:child_process` sem supervisor

**Rejeitada:** reproduz bugs de órfão e sem memory limit da v1. Sem restart automático.

### Opção B: `McpStdioSource` via `ProcessSupervisor` com `resolveRuntimeMode` (escolhida)

`resolveRuntimeMode(config)` determina `protected` (utilityProcess isolado) vs `compat` (host process):

```
auto → protected (Mac/Linux)
auto + Windows → compat
auto + needsBrowserAuth → compat
host (explícito) → compat
container (explícito) → protected
```

`ProcessSupervisor.spawn()` com `{ restartPolicy: 'on-crash', maxRestarts: 3, memoryLimitMb: 300 }`. Dispose da source chama `client.close()` + `processHandle.dispose()` em ordem.

### Opção C: supervisor genérico sem policy de modo

**Rejeitada:** Windows continuaria quebrando silenciosamente para MCPs com browser-auth.

## Decisão

Opção B. `@g4os/sources/mcp-stdio` com `McpStdioSource extends DisposableBase implements ISource`:

| Módulo | Papel |
|---|---|
| `source.ts` | `McpStdioSource` — activate / deactivate / listTools / callTool |
| `runtime-mode.ts` | `resolveRuntimeMode(config)` — policy auto/protected/compat |
| `factory.ts` | `mcpStdioFactory` — `kind: 'mcp-stdio'`, cria com supervisor injetado |

## Consequências

**Positivas:**
- Subprocessos supervisionados com restart automático — zero órfãos
- Memory limit 300MB previne vazamentos de MCPs de terceiros
- Policy `protected/compat` resolve incompatibilidade Windows/browser-auth automaticamente

**Negativas:**
- Runtime wiring real do `ProcessSupervisor` fica em `apps/desktop` — contrato precisa ser mantido em sync

**Neutras:**
- `@modelcontextprotocol/sdk` entra como peer — `@g4os/sources` não paga o custo se não usado

## Armadilhas preservadas da v1

1. Spawn ad-hoc sem supervisor → órfãos. v2: centralizado em `ProcessSupervisor`.
2. Sem memory limit → MCP vaza GB. v2: 300MB enforçado.
3. Protected mode forçado em Windows → quebra MCP com browser-auth. v2: `resolveRuntimeMode` detecta e usa compat.

## Referências

- ADR-0030 (Electron utilityProcess / ProcessSupervisor)
- ADR-0081 (ISource interface)
- ADR-0012 (DisposableBase)
- `STUDY/Audit/Tasks/08-sources-mcp/TASK-08-02-mcp-stdio-supervisor.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-08-02 landed).
