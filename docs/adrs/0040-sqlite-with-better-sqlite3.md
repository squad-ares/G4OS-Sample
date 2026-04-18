# ADR 0040: SQLite persistence with better-sqlite3

## Metadata

- **Numero:** 0040
- **Status:** Superseded by [ADR-0040a](./0040a-node-sqlite-native.md)
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 04-data-layer (TASK-04-01)

> ⚠️ **Superseded same day.** A premissa "Node 24 ainda não disponível no runtime Electron" foi revista logo após aceitação desta ADR. Electron 41 (abril/2026) já shippa Node 24 LTS, liberando `node:sqlite` estável. ADR-0040a adotou `node:sqlite` nativo em vez de `better-sqlite3`, eliminando todo binding nativo de SQLite. Esta ADR permanece imutável como registro histórico do raciocínio inicial.

## Contexto

v1 persistia tudo em arquivos JSON:

1. **Queries lineares:** buscar uma sessão era `readdirSync + JSON.parse * N`
2. **Sem índices:** filtrar por label/status percorre o disco inteiro
3. **Corrupção em crash:** escrita parcial do JSON deixava workspace inutilizável
4. **Sem transação:** alteração de múltiplos arquivos podia ficar inconsistente
5. **Escala ruim:** 500+ sessões por workspace = boot lento (seconds)

v2 objetivo: **SQLite como índice + catálogo**; JSONL continua como log append-only de eventos por sessão.

## Opções consideradas

### Opção A: `better-sqlite3` (adotada)
**Descrição:**
Binding nativo síncrono para SQLite3. API simples, single-threaded, sem callback-hell.

```ts
import Database from 'better-sqlite3';
const db = new Database('app.db');
db.pragma('journal_mode = WAL');
db.prepare('INSERT INTO sessions (id, title) VALUES (?, ?)').run(id, title);
```

**Pros:**
- API síncrona simples (SQLite é single-writer de qualquer jeito)
- Performance top (prebuild binding, sem IPC overhead)
- WAL mode para concorrência de leitura
- Transações completas com rollback
- Maduro, estável, amplamente usado (Obsidian, Anki, etc.)
- Comunidade Electron: suporte oficial, exemplos abundantes

**Contras:**
- Binding nativo: precisa rebuild por Node ABI / plataforma
- `asarUnpack` obrigatório no electron-builder
- Síncrono: não ideal se precisar chamar do renderer direto (não é o caso — renderer nunca fala com SQLite)

**Custo de implementação:** M (2 dias: wrapper + packaging)

### Opção B: `node:sqlite` (built-in experimental)
**Descrição:**
Node 22+ trouxe `node:sqlite` embutido. Mesma API do better-sqlite3, sem dep externa.

**Pros:**
- Zero dependência externa
- Sem rebuild por ABI (embutido no Node)

**Contras:**
- Experimental no Node 22+, estável só a partir de Node 24
- Electron ainda não ships com Node 24 (runtime atual é Node 20)
- API ainda em flux
- Documentação minguada

**Custo de implementação:** ✗ (bloqueado por runtime Electron)

### Opção C: `sql.js` (SQLite em WASM)
**Descrição:**
SQLite compilado para WASM, puro JS.

**Pros:**
- Sem binding nativo, sem rebuild
- Funciona em ambiente sandboxado (browser/worker)

**Contras:**
- Slower (3-10x) por WASM/JS overhead
- Sem persistência real (precisa serializar o DB inteiro para um Buffer)
- Memory hungry (banco inteiro em RAM)

**Custo de implementação:** S (mas performance inviabiliza uso sério)

### Opção D: `libsql` (fork do SQLite)
**Descrição:**
Fork mantido pelo Turso, compatível com SQLite, com recursos extras.

**Pros:**
- API compatível com SQLite
- Suporte a replicação embedded (se precisarmos no futuro)

**Contras:**
- Imaturo comparado a SQLite canônico
- Dep pesada, recursos que não usamos
- Documentação focada em Turso cloud, não embedded local

**Custo de implementação:** M (similar ao better-sqlite3)

## Decisão

Optamos pela **Opção A (better-sqlite3)** porque:

1. **Maduro:** >10 anos de uso em produção, bindings estáveis
2. **Performance:** síncrono + WAL = menor overhead que alternativas
3. **Ecossistema:** exemplos abundantes para Electron
4. **Tipos:** `@types/better-sqlite3` mantido, boa DX
5. **Drizzle-friendly:** prepara o caminho para TASK-04-02 (ORM)
6. **Downgrade-path-safe:** se libsql/node:sqlite amadurecer depois, swap é pequeno (wrapper `Db` isola o binding)

## Arquitetura

### Wrapper `@g4os/data/sqlite`
- `Db` classe disposable: `open(options)`, `prepare`, `exec`, `pragma`, `transaction`, `close`
- Binding nativo resolvido via `import()` dinâmico → erro claro se faltar
- Pragmas padrão: `journal_mode=wal`, `foreign_keys=ON`, `synchronous=NORMAL`, `mmap_size=256MB`
- Filename default: `getAppPaths().data/app.db` (via `@g4os/platform`)
- Erros tipados: `SqliteNativeBindingError`, `SqliteOpenError`, `SqliteClosedError`

### Packaging (electron-builder)
- `asarUnpack: ["**/node_modules/better-sqlite3/**", ...]` para que o `.node` binding seja extraído do asar
- `npmRebuild: true` para recompilar contra Electron's Node ABI
- Config em `apps/desktop/electron-builder.json`

### Dev/Test
- Scaffolding pattern: `better-sqlite3` importado via `import()` dinâmico → pacote typechec­ka/linta sem binding presente
- Testes `describeIfBinding` pulam quando binding não funcional (CI sem build step)

## Consequências

### Positivas
- **Queries indexadas:** `WHERE workspace_id = ? AND status = ?` em ms, não seconds
- **Transações:** operações multi-tabela atômicas
- **WAL:** reader concorrente com writer (ex.: UI lê enquanto backup escreve)
- **Durabilidade:** `synchronous=NORMAL` balanceia integridade vs throughput
- **Backup trivial:** `VACUUM INTO '/path/backup.db'` ou copy do arquivo WAL-checkpointed
- **Observabilidade:** logger verbose por query em dev

### Negativas / Trade-offs
- **Binding nativo:** Electron rebuild necessário por versão (electron-builder cuida)
  - Mitigation: `npmRebuild: true` + CI matrix por plataforma
- **asarUnpack obrigatório:** esquecer causa crash no packaged app
  - Mitigation: check em release gate + integration test
- **Single writer:** SQLite serializa escritas; escrita concorrente = WAL lock
  - Mitigation: escritas rotineiras são rápidas; uso crítico fica atrás de `transaction`
- **Sem suporte a row-level locking:** adequado para escala de 1-user-per-db
  - Mitigation: cada workspace pode ter seu próprio `.db` no futuro se precisar

### Neutras
- Síncrono em main process: não bloqueia renderer (IPC é async, e `utilityProcess` workers fazem CPU-pesado)
- Migrações ficam por conta de TASK-04-03

## Implementação

### Arquivos criados (TASK-04-01)
- [x] `packages/data/package.json` — private scaffolding
- [x] `packages/data/tsconfig.json`
- [x] `packages/data/tsup.config.ts`
- [x] `packages/data/src/index.ts` — barrel
- [x] `packages/data/src/sqlite/index.ts` — subpath
- [x] `packages/data/src/sqlite/database.ts` — Db wrapper
- [x] `packages/data/src/sqlite/types.ts` — types locais
- [x] `packages/data/src/sqlite/errors.ts` — erros tipados
- [x] `packages/data/src/__tests__/database.test.ts` — 8 testes
- [x] `apps/desktop/electron-builder.json` — asarUnpack + npmRebuild

### Configs atualizados
- [x] `tsconfig.base.json` — referência para `./packages/data`
- [x] `knip.json` — ignoreDependencies para `better-sqlite3` (dynamic import)

### Testes (8/8 passando)
- opens in WAL mode by default
- enforces foreign keys
- uses synchronous=NORMAL by default
- supports prepare + run + get roundtrip
- transaction commits atomically
- transaction rolls back on throw
- throws SqliteClosedError after dispose
- opens `:memory:` database

## Validação

- [x] Binding carrega e cria DB em macOS (dev)
- [x] WAL mode confirmado via pragma
- [x] `foreign_keys = ON` confirmado
- [x] INSERT/SELECT roundtrip
- [x] Transação atômica (commit + rollback)
- [x] Dispose fecha arquivo e invalida prepare
- [ ] CI matrix macOS/Windows/Linux (pending TASK-04 suite)
- [ ] asarUnpack validado em packaged app (pending packaging epic)

## Histórico de alterações

- 2026-04-18: Proposta inicial e implementação do wrapper
- (pendente) Validação CI matrix 3-platforms
- (pendente) Validação em packaged build

## Referências

- [better-sqlite3 docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [SQLite WAL mode](https://www.sqlite.org/wal.html)
- [SQLite pragmas](https://www.sqlite.org/pragma.html)
- [electron-builder asarUnpack](https://www.electron.build/configuration/asar-integrity)
- ADR-0012: Disposable pattern (usado no `Db` wrapper)
- ADR-0013: Platform abstraction (`getAppPaths` vem daqui)
- TASK-04-02: Drizzle ORM (próxima task)
- TASK-04-03: Migrations (próxima task)
