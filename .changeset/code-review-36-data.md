---
'@g4os/data': patch
---

Code Review 36 — packages/data — 12 findings (1 CRITICAL + 4 MAJOR + 4 MEDIUM + 3 LOW).

Escopo: code review exaustivo do `packages/data` (SQLite + Drizzle + JSONL event store + CAS attachments + ZIP backup + FTS5 + projects/labels/sessions repositories + migrations). ADRs consultadas: 0010, 0011, 0012, 0040, 0040a, 0042, 0043, 0044, 0045, 0119, 0121, 0123, 0125, 0126, 0127, 0129, 0153.

---

## F-CR36-1 — `rebuildProjection` é destrutivo: cascade DELETE da row de `sessions` apaga `attachment_refs` + `session_labels` (CRITICAL)

**Arquivo**: `packages/data/src/events/replay.ts:30-34`
**ADR**: 0010 (event sourcing — replay deve ser idempotente), 0044 (attachment refcount), 0127 (labels)

```ts
db.transaction((tx) => {
  tx.delete(messagesIndex).where(eq(messagesIndex.sessionId, sessionId)).run();
  tx.delete(eventCheckpoints).where(eq(eventCheckpoints.sessionId, sessionId)).run();
  tx.delete(sessions).where(eq(sessions.id, sessionId)).run();   // ← cascade
});
```

**Root cause**: `sessions.id` é referenciada com `ON DELETE CASCADE` por `attachment_refs.session_id` (migration 20260427) e `session_labels.session_id` (migration 20260422). `DELETE FROM sessions WHERE id=?` cascateia e apaga TODOS os refs de attachment + labels da sessão. `applyEvent` depois só reinsere a row de `sessions` + `messages_index` — **rebuild perde attachments e labels permanentemente**. Também usado por `restoreWorkspaceBackup` (`backup/import.ts:80`), que rebuilda toda sessão importada — restore de backup zera attachment_refs (vaza disco via blobs órfãos com refCount inflado pelo gateway depois do restore) e labels (UI mostra sessões sem labels após restore, sem aviso).

ADR-0010 garante "replay é função pura do log de eventos para projection". Como `attachment_refs`/`session_labels` não estão no event log JSONL (são state-side, não event-sourced), apagá-los é violação do contrato — eles vivem em camada paralela.

**Fix**: trocar `tx.delete(sessions)` por `tx.update(sessions).set({ messageCount: 0, lastMessageAt: null, lastEventSequence: 0 })` antes do replay. Isso preserva `attachment_refs`/`session_labels`/`pinnedAt`/`starredAt`/`enabledSourceSlugsJson` e só reseta o que o reducer recompõe a partir dos eventos. Adicionar teste de regressão: attach attachment + setLabels + rebuildProjection → ambos devem sobreviver.

---

## F-CR36-2 — `applyEvent` abre uma transação por evento: replay de 10k eventos = 10k fsyncs (MAJOR)

**Arquivo**: `packages/data/src/events/reducer.ts:33-179`, `packages/data/src/events/replay.ts:37-40`
**ADR**: 0040a (synchronous=NORMAL), 0010 (replay)

`applyEvent` envolve cada evento em `db.transaction(...)` (linha 34). `rebuildProjection` (`replay.ts:37`) e `catchUp` (`replay.ts:59`) iteram eventos chamando `applyEvent` em loop — N eventos = N transactions = N fsyncs WAL.

Em uma sessão de 5k mensagens (~10k eventos) com `synchronous=NORMAL` no WAL (~2-5ms por commit em SSD): replay pós-crash custa **20-50 segundos**. Em workspace com 50 sessões impactadas, boot trava 15min+. Stack-degenerate em prod.

**Fix**: `applyEvent` recebe `tx` opcional. Se chamado em loop por replay, a transação é aberta UMA vez no caller envolvendo a iteração inteira. Sketch:
```ts
export function applyEvent(db: AppDb | Tx, event: SessionEvent): void { ... }  // sem tx
// caller:
db.transaction((tx) => { for (const e of events) applyEvent(tx, e); });
```
Considerar batch de checkpoint (1 update no fim em vez de N upserts).

---

## F-CR36-3 — Migration `20260427000000_attachment_refs_cascade` faz `DROP TABLE`/`RENAME` com `PRAGMA foreign_keys = ON` (MAJOR)

**Arquivo**: `packages/data/drizzle/20260427000000_attachment_refs_cascade/migration.sql`
**ADR**: 0040a (FK ON pragma default), spec SQLite https://www.sqlite.org/lang_altertable.html#otheralter

A migração faz o pattern `CREATE TABLE _new + INSERT FROM old + DROP old + RENAME _new`. O DB é aberto com `PRAGMA foreign_keys=ON` (`database.ts:172`). A doc oficial do SQLite exige:

```
PRAGMA foreign_keys=OFF;
BEGIN;
... DROP / RENAME ...
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys=ON;
```

Sem `foreign_keys=OFF`, o `DROP TABLE attachment_refs` pode disparar cascades parciais (em tabelas dependentes que usem `ON DELETE CASCADE` apontando pra `attachment_refs`) ou falhar com `FOREIGN KEY constraint failed` em estados intermediários. No schema atual nada referencia `attachment_refs`, então **funciona por sorte**, mas qualquer migração futura que adicione FK saída de `attachment_refs.id` quebra esta migration retroativamente.

**Fix**: prefaciar migrations de table-rebuild com `PRAGMA foreign_keys=OFF;` e finalizar com `PRAGMA foreign_key_check;` antes do commit. Considerar helper `runRebuildMigration()` no `migrations/runner.ts` que aplica o pattern canônico. Drizzle-kit 1.0-beta gera `--> statement-breakpoint` por linha, então a transação ainda envolve tudo.

---

## F-CR36-4 — `attachmentRefs.sessionId IN ${sessionIds}` em `gateway.ts:211` interpola array no Drizzle `sql` template — pode falhar runtime (MAJOR)

**Arquivo**: `packages/data/src/attachments/gateway.ts:206-214`
**ADR**: 0042 (Drizzle beta pinado), 0044 (CAS attachments)

```ts
.where(sql`${attachmentRefs.sessionId} IN ${sessionIds}`)
```

Drizzle `sql` template não auto-expande arrays para `IN (?, ?, ?)` — passa `sessionIds` como **um único parâmetro** (string serializada ou erro de bind dependendo do driver). O caminho canônico é `inArray(attachmentRefs.sessionId, sessionIds)`. O test em `attachments.test.ts:233` passa só com 1 sessionId, escondendo o bug — com 2+ sessionIds o backup exporter (`exportWorkspaceBackup`) em workspace multi-sessão retorna **zero attachments**, então o ZIP exporta sem blobs e o restore depois quebra com `Missing entry: attachments/<hash>`.

**Fix**: trocar para `import { inArray } from 'drizzle-orm'; .where(inArray(attachmentRefs.sessionId, [...sessionIds]))`. Adicionar test de regressão com 3+ sessionIds.

---

## F-CR36-5 — Migration runner não usa `--> statement-breakpoint` parsing custom: depende 100% do drizzle-orm beta (MAJOR)

**Arquivo**: `packages/data/src/migrations/runner.ts:51-63`
**ADR**: 0042 (drizzle beta pinado, plano de migração GA), 0153 (catalog drift)

`runMigrations` delega 100% pra `migrate()` do `drizzle-orm/node-sqlite/migrator`. Quando o pin migrar de `1.0.0-beta.17-8a36f93` para 1.0 GA (planejado no `docs/TODO-DRIZZLE-GA.md`), qualquer mudança no migrator (ordering, hash strategy, statement-breakpoint parsing) quebra o caminho de upgrade. Não há fallback custom nem testes que validem o comportamento isolado do migrator (existe `migrations.test.ts` mas testa o pipe inteiro, não breaking changes).

**Severity MAJOR e não CRITICAL**: pin congelado mitiga risco *agora*, mas não há defesa em profundidade. Comentário do header (linha 4-23) menciona "tabela `__drizzle_migrations` rastreia hash SHA-256" — se hash mudar entre versões, migrations já aplicadas viram pendentes e re-rodam, **falhando** em `CREATE TABLE` (já existe).

**Fix**:
1. Snapshot test do output de `migrate()` para fixture de DB conhecido (golden file de `__drizzle_migrations` rows + hashes).
2. Plano explícito no `TODO-DRIZZLE-GA.md`: ao subir versão, validar no CI que hashes não mudam contra DB existente, ou rodar migration de re-key da tabela `__drizzle_migrations`.

---

## F-CR36-6 — `Db.open` é silencioso em re-open (no-op sem warn) (MEDIUM)

**Arquivo**: `packages/data/src/sqlite/database.ts:72-93`
**ADR**: 0012 (Disposable lifecycle)

```ts
async open(options: DbOptions = {}): Promise<void> {
  if (this.database) return;  // ← silent
  ...
}
```

Caller que tente `db.open({ filename: 'a.db' })` e depois `db.open({ filename: 'b.db' })` na mesma instância recebe um Db apontando para `a.db` sem qualquer sinal — opção foi descartada. Pega bug de orquestração silencioso em main process.

**Fix**: lançar `SqliteAlreadyOpenError` (novo erro em `errors.ts`) ou pelo menos `log.warn({ existingFilename, newFilename }, 'open() called on already-open Db')`.

---

## F-CR36-7 — Statements em `queries/search.ts` e `queries/global-search.ts` não cacheiam `prepare()` (MEDIUM)

**Arquivo**: `packages/data/src/queries/search.ts:43,64`, `packages/data/src/queries/global-search.ts:56,88,113`
**ADR**: 0119 (FTS5), 0129 (global FTS5)

Cada chamada de `searchMessages`/`globalSearch` re-prepara o mesmo SQL. `node:sqlite` faz cache interno em alguns casos mas o overhead de parsing é mensurável. Em FTS5 com snippet() o SQL é não-trivial. Para search-as-you-type (UI dispara por keystroke), 50+ prepares/segundo viram pressão no allocator.

**Fix**: cachear `StatementSync` por chave `${sql}-${sessionFilter}`. Usar `WeakRef`/Map em `Db` ou criar `PreparedStatementCache` em `sqlite/prepared.ts`. Garantir liberação no `dispose()`.

---

## F-CR36-8 — `event-store.count()` lê o JSONL inteiro só pra contar linhas (MEDIUM)

**Arquivo**: `packages/data/src/events/event-store.ts:175-186`

```ts
async count(sessionId: string): Promise<number> {
  let n = 0;
  const stats: ReadStats = { skipped: 0 };
  for await (const _ of this.read(sessionId, stats)) n += 1;  // parse Zod de cada linha
  return n;
}
```

`count()` invoca `read()` que faz `JSON.parse + SessionEventSchema.parse` por linha. Em JSONL de 100MB, conta com latência de centenas de ms só para retornar um inteiro. Caller canônico em `apps/desktop` provavelmente nem precisa do count exato — basta `lastEventSequence` da row de `sessions` em SQLite (já mantido em sync).

**Fix**: documentar que `count()` é caro e oferecer `countFast(sessionId)` que lê só a última linha (`tail`-equivalente) ou retorna `sessions.lastEventSequence` do SQLite. Renomear current para `countViaReplay()` se uso for restrito a debug/diagnose.

---

## F-CR36-9 — `searchMessages` (per-session) não filtra por `status='active'` (MEDIUM)

**Arquivo**: `packages/data/src/queries/search.ts:42-76`
**ADR**: 0126 (session lifecycle soft delete), 0129 (FTS5 global filtra)

`globalSearch` filtra `s.status = 'active'` (linhas 68, 99, 118), mas `searchMessages` não — assume que o caller já validou a sessão. Se `searchMessages` for chamado para sessão `deleted` ou `archived`, retorna hits. Soft-delete viola se UI mostrar resultados de sessão lixeira.

**Severity MEDIUM**: caller em `apps/desktop` provavelmente já filtra antes de chamar, mas defesa em profundidade da camada de dados é princípio do CLAUDE.md ("forcing functions"). Não é Boundary issue — é contrato do search.

**Fix**: aceitar `options.includeDeleted: boolean` (default false) e adicionar `JOIN sessions s ON s.id = mi.session_id WHERE s.status='active'` quando false.

---

## F-CR36-10 — `event-store.append()` faz `mkdir(recursive: true)` por evento (LOW)

**Arquivo**: `packages/data/src/events/event-store.ts:75-81`

`append` (escrita hot-path) chama `mkdir(dirname(path), { recursive: true })` em toda chamada. É idempotente mas é syscall extra; para sessão com 1000 eventos, são 1000 `mkdir` no FS. Otimização: cachear `Set<string>` de diretórios já criados in-memory; só `mkdir` no primeiro append por sessionId.

**Fix**: introduzir `private readonly knownDirs = new Set<string>()` no `SessionEventStore`. Limpar no dispose (que não existe — adicionar `IDisposable` ao store também resolve F-CR36-12 abaixo).

---

## F-CR36-11 — `branchSession` não trunca eventos com sequence > `atSequence` se `reader.readReplay` não respeitar `fromSequence` (LOW)

**Arquivo**: `packages/data/src/sessions/branching.ts:80-87`
**ADR**: 0128 (session branching copy-prefix)

```ts
for await (const event of deps.reader.readReplay(input.sourceId)) {
  if (event.sequence > input.atSequence) break;
  ...
}
```

Confia em ordenação ascendente do reader. `EventStoreReader` interface (`branching.ts:36-41`) declara opcional `fromSequence` mas a chamada em `branching.ts:80` ignora — passa nada. Se algum dia o reader retornar eventos fora de ordem (paralelismo, source heterogêneo), o `break` para cedo e a branch fica incompleta sem aviso.

**Fix**: trocar `break` por `continue` com filtro explícito:
```ts
if (event.sequence > input.atSequence) continue;
```
Custo: lê eventos extras se ordering quebrar; benefício: corretude independente da garantia de ordering. Alternativa: assert de ordering no reader.

---

## F-CR36-12 — `SessionEventStore` não implementa `IDisposable` (LOW)

**Arquivo**: `packages/data/src/events/event-store.ts:59`
**ADR**: 0012 (Disposable pattern obrigatório para classes que tocam recursos)

A classe não estende `DisposableBase` nem implementa `IDisposable`. Hoje não segura recursos (não mantém `WriteStream` aberto — comentário linha 27 explica), então a falta é defensiva e estilística. Mas qualquer evolução futura (cache de `dirfd`, `WriteStream` reutilizado, `FileHandle` por sessão para reduzir custo de `appendFile`) precisa do hook de dispose. Establishar agora evita refactor amplo depois. CLAUDE.md L186: "Toda classe que registra listener, timer, WeakRef, watcher, subprocess retorna um disposer".

**Fix**: `class SessionEventStore extends DisposableBase` + override `dispose()` no-op por enquanto. Habilita F-CR36-10 (cache `knownDirs`) sem leak.

---

## Áreas cobertas

- SQLite wrapper (`Db`, pragmas, transactions, errors) — ADR-0040a, 0040
- Drizzle integration + migration runner — ADR-0042, 0153
- Migrations folder (9 migrations, schema evolution) — ADR-0042
- Event store JSONL append/read/truncate/cleanup — ADR-0010, 0043
- Reducer + replay + catchUp + truncateProjection — ADR-0010
- AttachmentStorage (CAS, hash validation, writeAtomic) — ADR-0044
- AttachmentGateway (refcount, locks per-hash, GC) — ADR-0044
- Backup export (size guard, archiver) + import (yauzl, zip-slip defense, manifest schema) — ADR-0045, 0125
- Sessions repository (CRUD, lifecycle, branching, flags, labels assoc) — ADR-0126, 0127, 0128
- Labels repository (materialized path, reparent cascade) — ADR-0127
- Projects + project_tasks repositories (slug guard, fractional order) — ADR-0130, 0132
- Workspace seeds (bundled skills) — ADR-0121
- FTS5 schema + per-session search + global search (fallback LIKE, escape) — ADR-0119, 0129
- Boundary check: 0 imports fora de `@g4os/kernel`/`@g4os/platform` (ADR-0013)
- TypeScript: 0 `any`, 0 `@ts-ignore`, `as unknown as` apenas em row casts justificados pela borda do driver
- Result/Disposable patterns (ADR-0011, 0012) — repositories usam exceptions onde Result seria melhor (low priority)

---

## Top 3 prioridades

1. **F-CR36-1 (CRITICAL)** — `rebuildProjection` apaga `attachment_refs` + `session_labels` por cascade. Restore de backup perde dados silenciosamente. Corrigir antes de qualquer release que faça restore em produção.
2. **F-CR36-4 (MAJOR)** — `IN ${array}` no Drizzle `sql` template em `gateway.listReferencedHashesForSessions`. Backup multi-sessão exporta sem attachments. Trocar por `inArray()`.
3. **F-CR36-2 (MAJOR)** — `applyEvent` em loop = N transactions. Replay pós-crash de workspace grande trava boot por minutos. Refatorar para tx única no caller.
