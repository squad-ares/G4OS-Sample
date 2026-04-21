# ADR 0081: ISource interface + SourceRegistry pluginável

## Metadata

- **Numero:** 0081
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @agents-team
- **Task relacionada:** TASK-08-01 (epic 08-sources-mcp)

## Contexto

G4 OS v1 implementava cada tipo de source (MCP stdio, MCP HTTP/SSE, managed connectors, filesystem, API) como classes independentes sem contrato comum. O `sessions.ts` conhecia cada tipo individualmente via `if/else` por `kind`, acumulando lógica de status, auth, tool listing e dispose espalhada por múltiplos arquivos sem garantia de IDisposable — com vazamentos de subprocess, token e listener recorrentes.

Requisitos para v2:
- Interface única `ISource extends IDisposable` cobrindo todos os tipos v1
- `SourceRegistry` com lifecycle completo: `activate / deactivate / get / list`
- Status observável via `BehaviorSubject<SourceStatus>` — consumidores nunca acessam estado sync
- Factory plugável por kind — `SessionManager` não precisa conhecer implementações
- Testável sem Electron ou MCP real (toda a interface é mockável)

## Opções consideradas

### Opção A: classes separadas por kind sem contrato (status quo v1)

**Rejeitada:** `sessions.ts` obrigado a conhecer cada tipo individualmente. Sem garantia de `IDisposable` → leaks. Impossível testar source sem subir processo real.

### Opção B: `ISource` minimalista + DI extrema (escolhida)

Interface `ISource extends IDisposable` com `activate / deactivate / listTools / callTool / status$` e `authenticate?` opcional. Runtimes externos entram por injeção — `@g4os/sources` não importa `@modelcontextprotocol/sdk`, `electron` nem `node-fetch` diretamente.

`SourceRegistry` centraliza ciclo de vida: mapeia `SourceFactory` por kind, instancia sob demanda, deactivate + dispose conjunto. Sources já ativas retornam a mesma instância (idempotência).

### Opção C: `IntegrationManager` único (God Object)

**Rejeitada:** volta para o padrão monolítico de v1 com if/else interno por kind. Impede split por transport e torna testes impossíveis.

## Decisão

Opção B. `@g4os/sources/interface` expõe:

```typescript
interface ISource extends IDisposable {
  readonly slug: string;
  readonly kind: SourceKind;
  readonly metadata: SourceMetadata;
  readonly status$: Observable<SourceStatus>;

  activate(): Promise<Result<void, SourceError>>;
  deactivate(): Promise<void>;
  listTools(): Promise<Result<ToolDefinition[], SourceError>>;
  callTool(name: string, input: unknown, signal?: AbortSignal): Observable<ToolResult>;
  authenticate?(): Promise<Result<void, SourceError>>;
}

interface SourceFactory {
  readonly kind: SourceKind;
  supports(config: SourceConfig): boolean;
  create(config: SourceConfig): ISource;
}
```

`SourceRegistry` garante idempotência em `activate` (retorna instância existente se já ativa), propaga `dispose()` junto com `deactivate`, e rejeita com `SourceError.incompatible` se nenhum factory suportar o kind.

## Consequências

**Positivas:**
- Novo kind de source = 1 factory, zero churn em `SessionManager`
- Boundary `sources → kernel` enforçada por depcruiser (`sources-interface-isolated`)
- Testes de unit cobrem interface sem Electron ou MCP real

**Negativas:**
- Runtime wiring real (MCP client concreto, subprocess spawner, `safeStorage`-backed TokenStore) fica em `apps/desktop`

**Neutras:**
- `exactOptionalPropertyTypes` respeitado com conditional-spread ao repassar configs opcionais

## Validação

- `ISource` cobre todos os tipos v1 (`mcp-stdio` / `mcp-http` / `managed` / `filesystem` / `api`)
- `SourceRegistry` com lifecycle completo: activate / deactivate / get / list
- Status observable via BehaviorSubject funciona
- Testes sem Electron/MCP real

## Referências

- ADR-0012 (IDisposable / DisposableBase)
- ADR-0011 (Result<T, E> via neverthrow)
- ADR-0070 (agentes — mesmo padrão de contrato + registry + factory)
- `STUDY/Audit/Tasks/08-sources-mcp/TASK-08-01-source-interface.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-08-01 landed).
