# @g4os/data

Camada de persistência: SQLite, schemas, event sourcing, attachments e backup/restore.

## Módulos

- **`sqlite/`** — Wrapper sobre `node:sqlite` (WAL, FK ON, mmap 256 MB)
- **`migrations/`** — Migrations Drizzle + helper `runMigrations()`
- **`schema/`** — Schemas Drizzle ORM (workspaces, sessions, messages, attachments)
- **`events/`** — Event store JSONL (append-only por sessão, replay, checkpoints multi-consumer)
- **`attachments/`** — Armazenamento content-addressed (SHA-256, refcount, GC)
- **`backup/`** — Export/import em ZIP v1 (manifest, sessões JSONL, blobs de attachments)

## Stack

- [`node:sqlite`](https://nodejs.org/api/sqlite.html) (Node 24 LTS, nativo, zero bindings externos)
- [`drizzle-orm@1.0.0-beta.17-8a36f93`](https://orm.drizzle.team) (pinado até GA — ver ADR-0042)
- [`archiver@7`](https://archiver.readthedocs.io) (export ZIP)
- [`yauzl@3`](https://github.com/thejoshwolfe/yauzl) (import ZIP)
- [`zod@^4.3.6`](https://zod.dev) (validação em runtime)

## ADRs principais

- **ADR-0040a:** `node:sqlite` nativo, WAL, journaling synchronous
- **ADR-0042:** Drizzle ORM em beta pinado + estratégia de migrations
- **ADR-0043:** Event store JSONL append-only + replay + checkpoints
- **ADR-0044:** Attachments content-addressed + refcount + GC
- **ADR-0045:** Formato de backup ZIP v1 + scheduler 7/4/3

## Uso

### Inicializar o banco

```ts
import { initDatabase } from '@g4os/data';

const { db, drizzle, backupPath } = await initDatabase({
  // filename: '/path/to/app.db' (default: app paths)
  // migrationsFolder: '/path/to/drizzle' (default: auto-resolvido)
  // skipBackup: false
});
```

### Event store

```ts
import { SessionEventStore } from '@g4os/data/events';

const store = new SessionEventStore(workspaceId);
await store.append(sessionId, event);

for await (const event of store.read(sessionId)) {
  console.log(event);
}

const pending = await store.readAfter(sessionId, lastSequence);
```

### Attachments

```ts
import { AttachmentStorage, AttachmentGateway } from '@g4os/data/attachments';

const storage = new AttachmentStorage();
const gateway = new AttachmentGateway({ db: drizzle, storage });

const { refId, hash, size } = await gateway.attach({
  content: Buffer.from('...'),
  sessionId,
  messageId,
  originalName: 'arquivo.txt',
});

await gateway.detach(refId);
const orphanCount = await gateway.gc({ ttlMs: 7 * 24 * 60 * 60 * 1000 });
```

### Backup/restore

```ts
import { exportWorkspaceBackup, restoreWorkspaceBackup } from '@g4os/data/backup';

const result = await exportWorkspaceBackup({
  workspaceId,
  db: drizzle,
  storage,
  gateway,
  workspaceRoot: getAppPaths().workspace(workspaceId),
  outputPath: '/path/to/backup.zip',
  appVersion: '0.9.0',
});

const restored = await restoreWorkspaceBackup({
  backupPath: '/path/to/backup.zip',
  db: drizzle,
  storage,
  workspaceRoot: getAppPaths().workspace(workspaceId),
  failIfExists: true,
});
```

### CLI: status de migrations

```bash
pnpm db:migrate:status
pnpm db:migrate:status --db /path/to/app.db
pnpm db:migrate:status --migrations /path/to/drizzle
```

Mostra migrations locais, aplicadas e pendentes. É read-only — não cria banco.

## Testes

```bash
pnpm test
pnpm test:watch
```

## Exports

```ts
import { ... } from '@g4os/data'              // principais
import { ... } from '@g4os/data/sqlite'       // wrapper SQLite
import { ... } from '@g4os/data/schema'       // schemas Drizzle
import { ... } from '@g4os/data/migrations'   // helpers de migration
import { ... } from '@g4os/data/events'       // event store
import { ... } from '@g4os/data/attachments'  // gateway de attachments
import { ... } from '@g4os/data/backup'       // backup/restore
```
