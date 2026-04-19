# @g4os/data

Data layer: SQLite persistence, schemas, event sourcing, attachments, backup/restore.

## Modules

- **`sqlite/`** — Raw SQLite wrapper (`node:sqlite`, WAL, FK ON, mmap 256MB)
- **`migrations/`** — Drizzle migrations + `runMigrations()` helper
- **`schema/`** — Drizzle ORM schemas (workspaces, sessions, messages, attachments)
- **`events/`** — JSONL event store (append-only per session, replay, multi-consumer checkpoints)
- **`attachments/`** — Content-addressed storage (SHA-256, refcount, GC)
- **`backup/`** — Export/import ZIP v1 (manifest, sessions JSONL, attachments blobs)

## Stack

- [`node:sqlite`](https://nodejs.org/api/sqlite.html) (Node 24 LTS, native, zero external bindings)
- [`drizzle-orm@1.0.0-beta.17-8a36f93`](https://orm.drizzle.team) (pinned until GA per ADR-0042)
- [`archiver@7`](https://archiver.readthedocs.io) (ZIP export)
- [`yauzl@3`](https://github.com/thejoshwolfe/yauzl) (ZIP import)
- [`zod@^4.3.6`](https://zod.dev) (runtime validation)

## Key ADRs

- **ADR-0040a:** `node:sqlite` native, WAL, synchronous journaling
- **ADR-0042:** Drizzle ORM beta pinned, migration strategy
- **ADR-0043:** JSONL append-only event store + replay + checkpoints
- **ADR-0044:** Content-addressed attachment storage + refcount + GC
- **ADR-0045:** ZIP v1 backup format + scheduler (7/4/3 retention)

## Usage

### Init database

```ts
import { initDatabase } from '@g4os/data';

const { db, drizzle, backupPath } = await initDatabase({
  // filename: '/path/to/app.db' (default: app paths)
  // migrationsFolder: '/path/to/drizzle' (default: auto-resolved)
  // skipBackup: false
});

// db: Db (sqlite wrapper)
// drizzle: AppDb (typed ORM client)
// backupPath: string | null (backup before last migration)
```

### Event store

```ts
import { SessionEventStore } from '@g4os/data/events';

const store = new SessionEventStore(workspaceId);

// Append
await store.append(sessionId, event);

// Read all events
for await (const event of store.read(sessionId)) {
  console.log(event);
}

// Read after checkpoint
const pending = await store.readAfter(sessionId, lastSequence);
```

### Attachments

```ts
import { AttachmentStorage, AttachmentGateway } from '@g4os/data/attachments';

const storage = new AttachmentStorage();
const gateway = new AttachmentGateway({ db: drizzle, storage });

// Attach blob
const { refId, hash, size } = await gateway.attach({
  content: Buffer.from('...'),
  sessionId,
  messageId,
  originalName: 'file.txt',
});

// Detach (cascade refcount)
await gateway.detach(refId);

// GC orphaned blobs
const orphanCount = await gateway.gc({ ttlMs: 7 * 24 * 60 * 60 * 1000 });

// List session attachments
const hashes = gateway.listReferencedHashesForSessions([sessionId]);
```

### Backup/restore

```ts
import {
  exportWorkspaceBackup,
  restoreWorkspaceBackup,
} from '@g4os/data/backup';

// Export
const result = await exportWorkspaceBackup({
  workspaceId,
  db: drizzle,
  storage,
  gateway,
  workspaceRoot: getAppPaths().workspace(workspaceId),
  outputPath: '/path/to/backup.zip',
  appVersion: '0.9.0',
});
// → { size, sessionsCount, attachmentsCount, manifestVersion }

// Restore
const restored = await restoreWorkspaceBackup({
  backupPath: '/path/to/backup.zip',
  db: drizzle,
  storage,
  workspaceRoot: getAppPaths().workspace(workspaceId),
  failIfExists: true,
});
// → { sessionsRestored, attachmentsRestored }
```

### CLI: migration status

```bash
pnpm db:migrate:status
pnpm db:migrate:status --db /path/to/app.db
pnpm db:migrate:status --migrations /path/to/drizzle
```

Shows local migrations, applied migrations, and pending.

## Testing

```bash
pnpm test              # vitest run
pnpm test:watch       # vitest --watch
```

Test files in `src/__tests__/*.test.ts` cover: migrations, event store, attachments, backup/restore.

## Exports

```ts
import { ... } from '@g4os/data'              // main exports
import { ... } from '@g4os/data/sqlite'       // SQLite wrapper
import { ... } from '@g4os/data/schema'       // Drizzle schemas
import { ... } from '@g4os/data/migrations'   // Migration helpers
import { ... } from '@g4os/data/events'       // Event store
import { ... } from '@g4os/data/attachments'  // Attachments gateway
import { ... } from '@g4os/data/backup'       // Backup/restore
```
