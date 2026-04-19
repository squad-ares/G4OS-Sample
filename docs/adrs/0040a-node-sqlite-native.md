# ADR 0040a: Node.js built-in `node:sqlite` as SQLite driver

## Metadata

- **Numero:** 0040a
- **Status:** Accepted (supersedes ADR-0040)
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 04-data-layer (TASK-04-01, re-executed)
- **Supersede:** ADR-0040 (better-sqlite3)

## Contexto

ADR-0040 adotou `better-sqlite3` em 2026-04-18 como driver SQLite, com a ressalva explícita de que `node:sqlite` estava bloqueado por incompatibilidade com o runtime Electron (Node 20 na época).

**Revisão dessa premissa, mesmo dia:** Node 24 é LTS desde mai/2025; `node:sqlite` saiu de experimental em Node 24.0. Electron 41 (abril/2026, versão atual) ship­pa com Node 24. A incompatibilidade citada no ADR-0040 **não existe mais** — nem existia desde Electron 38 (fim de 2025). `better-sqlite3` foi escolhido por inércia de referência, não por restrição real.

O impacto é material: `better-sqlite3` carrega uma classe inteira de problemas que a v2 está **explicitamente tentando eliminar** (dor reportada nº 1 do cliente — runtime perdido no Windows):

- Binding nativo precisa ser recompilado contra a ABI de cada versão do Electron
- `npmRebuild: true` no `electron-builder` é obrigatório
- `asarUnpack` para o `.node` é obrigatório
- Antivírus corporativos no Windows colocam `.node` em quarentena silenciosa
- Cada upgrade de Electron pode quebrar a compilação em alguma plataforma
- Install em máquina do usuário sem toolchain de build (Python/VS Build Tools no Windows) falha

`node:sqlite` elimina **todos** esses vetores porque é parte do runtime Node — já está dentro do binário do Electron, não tem `.node` separado, não precisa rebuild, não aparece no `node_modules`.

## Opções consideradas

### Opção A: `node:sqlite` (adotada)
**Descrição:**
Usar o módulo `node:sqlite` embutido no Node 24 LTS. API síncrona, `DatabaseSync`, `StatementSync`.

```ts
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('app.db');
db.exec('PRAGMA journal_mode = WAL');
const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
const row = stmt.get(id);
```

**Pros:**
- Zero binding nativo — não existe `.node` para quarentenar
- Zero `npmRebuild` — runtime é o próprio Electron
- Zero `asarUnpack` específico para SQLite
- Zero supply chain de `prebuild-install` → `node-gyp` → compilador local
- `pnpm install` nunca quebra por toolchain ausente
- API idêntica em contrato ao better-sqlite3 (sync, prepare/run/get/all/iterate)
- Elimina toda uma classe de incidentes do suporte
- Drizzle ORM tem adapter first-class (`drizzle-orm/node-sqlite`) — confirmado em `https://orm.drizzle.team/docs/connect-node-sqlite`

**Contras:**
- Trava o floor do Electron em ≥ 38 (Node 24). Hoje (Electron 41) é trivial; futuro upgrade forçado só se Electron regrediar de Node, o que não acontece.
- Sem helper `db.transaction(fn)` — precisamos reimplementar (5 linhas via BEGIN/COMMIT/ROLLBACK)
- API menos rica em features avançadas (backup API, load extension, UDFs em JS). Fora do escopo G4OS para índices + metadata + event store.
- Ecossistema menor de exemplos (lib nova vs lib com 10 anos)

**Custo de implementação:** S (já implementado — wrapper idêntico, 5 linhas de transaction helper)

### Opção B: `better-sqlite3` (revertida)
**Descrição:**
Manter ADR-0040. Binding nativo maduro, ecossistema grande.

**Pros:**
- Ecossistema maior, 10+ anos de produção
- Features avançadas (backup API, load extension)

**Contras (novamente, em contexto atualizado):**
- Todas as dores listadas em "Contexto" acima
- Especialmente: colide frontalmente com a dor nº 1 reportada pelo cliente. Manter binding nativo é contraditório com a proposta de "runtime empacotado, zero fragilidade de binding no Windows".

**Custo de implementação:** já pago, mas pagaria novamente em toda release via CI matrix e em cada upgrade de Electron.

### Opção C: Híbrido (better-sqlite3 só em drizzle)
**Descrição:**
`Db` wrapper usa `node:sqlite`, mas drizzle usa seu adapter `better-sqlite3`.

**Contras:**
- Mantém os problemas de binding por causa do drizzle
- Dois drivers coexistindo no runtime — complexidade sem ganho

**Custo de implementação:** maior que A, sem vantagem real depois que Drizzle oficializou `node-sqlite`.

## Decisão

Optamos pela **Opção A (`node:sqlite`)** porque:

1. **Alinhamento com princípio da v2:** runtime auto-contido, sem bindings externos para quebrar.
2. **Elimina 1 dor inteira do cliente:** binding nativo corrompido no Windows deixa de ser um vetor possível.
3. **Simplifica packaging:** uma linha a menos no `electron-builder.json`, zero rebuild em CI.
4. **Drizzle first-class:** TASK-04-02 prossegue sem friction (`drizzle-orm/node-sqlite` + `DatabaseSync`).
5. **Node 24 LTS:** suporte até abril/2027; Electron 41 já shippa Node 24.

Estabelecemos como **política**: Electron ≥ 38 é piso permanente da v2. Qualquer upgrade major de Electron valida primeiro que continua em Node 24+.

## Arquitetura

### Wrapper `@g4os/data/sqlite`
- `Db` classe disposable — contrato público idêntico ao anterior
- Binding: `import { DatabaseSync } from 'node:sqlite'` (direto, sem dynamic import — é stdlib)
- Pragmas aplicados via `exec()`: `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`, `mmap_size=256MB`
- `transaction(fn)` helper implementado manualmente:
  ```ts
  transaction<T>(fn: () => T): T {
    this.exec('BEGIN');
    try {
      const result = fn();
      this.exec('COMMIT');
      return result;
    } catch (err) {
      this.exec('ROLLBACK');
      throw err;
    }
  }
  ```
- Filename default: `getAppPaths().data/app.db` (via `@g4os/platform`)
- Erros tipados: `SqliteOpenError`, `SqliteClosedError` — removido `SqliteNativeBindingError` (não aplicável)

### Packaging (electron-builder)
- **Removido** `"**/node_modules/better-sqlite3/**"` do `asarUnpack`
- `npmRebuild: true` **permanece** porque outras dependências nativas podem existir no futuro (keytar substituto, sharp, etc.), mas SQLite não precisa mais
- CI matrix macOS/Windows/Linux não precisa mais do passo `pnpm rebuild better-sqlite3`

### Dev/Test
- Sem pattern de "skip if binding missing" — `node:sqlite` sempre existe em Node 24+
- Testes rodam sem setup adicional em qualquer ambiente com Node 24

## Consequências

### Positivas
- **Uma dor do cliente fechada estruturalmente:** binding nativo de SQLite não pode quebrar no Windows porque não existe
- **CI mais rápido:** sem passo de `pnpm rebuild better-sqlite3` em matrix de 3 plataformas
- **Install mais rápido:** sem compilação, sem `prebuild-install`, sem `node-gyp`
- **Packaging mais simples:** `asarUnpack` não precisa pensar em SQLite
- **Reprodutibilidade:** mesmo Node = mesmo SQLite; sem drift por ABI
- **Supply chain reduzida:** uma dep a menos (`better-sqlite3` + `@types/better-sqlite3` + `bindings` + `prebuild-install` + ...)

### Negativas / Trade-offs
- **Electron ≥ 38 é piso:** aceitável — não há razão para locar versão antiga em 2026
- **Transaction helper manual:** 5 linhas, coberto por teste
- **Features avançadas (UDF em JS, backup API) ausentes:** fora do escopo G4OS; se necessário no futuro, podemos migrar pontualmente
- **Ecossistema menor:** mitigação pela estabilidade de stdlib — API de `node:sqlite` é fixada por semver do Node, não vai mudar atoa

### Neutras
- Drizzle continua first-class via `drizzle-orm/node-sqlite`
- Migrations com drizzle-kit funcionam sem mudança

## Implementação (TASK-04-01, re-executada)

### Arquivos alterados
- [x] `packages/data/src/sqlite/database.ts` — `DatabaseSync` direto, `transaction` helper manual
- [x] `packages/data/src/sqlite/types.ts` — removido; tipos vêm de `node:sqlite`
- [x] `packages/data/src/sqlite/errors.ts` — `SqliteNativeBindingError` removido
- [x] `packages/data/src/__tests__/database.test.ts` — sem `describeIfBinding`, testes unconditional
- [x] `packages/data/package.json` — removidas `better-sqlite3` + `@types/better-sqlite3`
- [x] `apps/desktop/electron-builder.json` — removido `asarUnpack` de SQLite
- [x] `knip.json` — removida entrada `packages/data.ignoreDependencies`
- [x] `.nvmrc` — `20` → `24`
- [x] `package.json` (root) — `engines.node` `>=20.10.0` → `>=24.0.0`
- [x] `packages/kernel/package.json`, demais `engines` — `>=24.0.0`
- [x] `CLAUDE.md` + `AGENTS.md` — stack decisions table atualizada
- [x] `docs/adrs/0040-sqlite-with-better-sqlite3.md` — status `Superseded by ADR-0040a`
- [x] `docs/adrs/README.md` — índice atualizado

### Política futura (tasks sequenciais do épico 04)
- **TASK-04-02 (Drizzle):** `drizzle-orm/node-sqlite`; `drizzle({ client: new DatabaseSync(...) })`
- **TASK-04-03 (migrations):** `drizzle-kit` ou SQL raw via `db.exec` — ambos compatíveis
- **TASK-04-04 (event sourcing):** sem impacto — leitura agnóstica de driver
- **TASK-04-05, 04-06:** sem impacto — attachment/backup são filesystem

## Validação

- [x] Binding carrega sem rebuild (é stdlib)
- [x] WAL mode, foreign_keys, synchronous via `exec('PRAGMA ...')`
- [x] INSERT/SELECT roundtrip via `prepare`
- [x] Transação atômica (commit + rollback) via helper manual
- [x] Dispose fecha arquivo e invalida prepare
- [x] Typecheck/lint/test passando
- [ ] CI matrix macOS/Windows/Linux (pending TASK-13-04)
- [ ] Validado em packaged app com Electron ≥ 38 (pending TASK-12-01)

## Histórico de alterações

- 2026-04-18: Proposta inicial (mesmo dia que ADR-0040, após revisão da premissa de Node version disponível)
- 2026-04-18: Aceita. ADR-0040 movida para `Superseded by ADR-0040a`.

## Referências

- [Node.js `node:sqlite` stable em Node 24](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [Drizzle ORM — node-sqlite driver](https://orm.drizzle.team/docs/connect-node-sqlite)
- [Electron 41 release notes](https://www.electronjs.org/releases) — Node 24 bundled
- ADR-0040: better-sqlite3 (superseded)
- ADR-0012: Disposable pattern (usado no `Db` wrapper)
- ADR-0013: Platform abstraction (`getAppPaths`)
- TASK-04-02: Drizzle ORM (próxima)
- TASK-04-03: Migrations (próxima)
