# @g4os/credentials

Credential management layer: secure storage (Electron `safeStorage` + atomic writes + backup rotation), non-destructive v1→v2 migration, and pluggable OAuth token refresh via `RotationOrchestrator`.

## Sub-paths de importação

```ts
import { CredentialVault }                       from '@g4os/credentials';
import { createVault, createTestVault }          from '@g4os/credentials';
import type { IVault, VaultBackend }             from '@g4os/credentials';
import { RotationOrchestrator, OAuthRotationHandler, type RotationHandler } from '@g4os/credentials/rotation';
import { migrateV1Credentials }                  from '@g4os/credentials/migration';
```

## Modules

- **`vault.ts`** — `CredentialVault` class (mutex + atomic writes + 3x backup rotation + metadata per key)
- **`factory.ts`** — `createVault({ mode })` factory (`prod` / `dev` / `test`)
- **`backends/`** — Backend implementations:
  - `memory.ts` (in-memory, tests)
  - `file.ts` + `codec.ts` (file-based with AES-256-GCM encoding)
  - `safe-storage.ts` (Electron `safeStorage`, via dynamic import to avoid runtime dep)
- **`rotation/`** — Async credential refresh orchestration:
  - `handler.ts` — `RotationHandler` interface
  - `oauth-handler.ts` — Generic RFC-6749 `refresh_token` handler
  - `orchestrator.ts` — `RotationOrchestrator extends DisposableBase` (periodic scan, pluggable handlers)
- **`migration/`** — Dry-run, idempotent v1→v2 migration (AES-256-GCM decryption of old `credentials.enc`)

## Stack

- [`@g4os/kernel`](../kernel) (schemas, Result pattern, DisposableBase, logger)
- [`@g4os/platform`](../platform) (paths, keychain abstraction)
- `electron` (app.getName, dynamically imported for `safeStorage`)
- `node:crypto` (native, no external bindings)

## Key ADRs

- **ADR-0050:** CredentialVault API (mutex + backups 3x + metadata)
- **ADR-0051:** Credential backends + Electron `safeStorage`
- **ADR-0052:** Credential migration v1 → v2 (non-destructive + idempotent)
- **ADR-0053:** Credential rotation (handlers pluggable + orchestrator DisposableBase)

## Usage

### Initialize vault

```ts
import { createVault } from '@g4os/credentials';

// Production (uses Electron safeStorage, atomic writes, 3x backups)
const vault = await createVault({ mode: 'prod' });

// Development (file-based with codec, single backup)
const vault = await createVault({ mode: 'dev' });

// Testing (in-memory, no I/O)
const vault = await createVault({ mode: 'test' });
```

### Store and retrieve secrets

```ts
import { CredentialError, ErrorCode } from '@g4os/kernel/errors';

// Store (encrypts, writes atomically, creates backup)
await vault.set('anthropic-key', 'sk-ant-...', {
  provider: 'anthropic',
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // optional
});

// Retrieve
const result = await vault.get('anthropic-key');
if (result.isErr()) {
  if (result.error.code === ErrorCode.CREDENTIAL_NOT_FOUND) { /* retry login */ }
  throw result.error;
}
const key = result.value;

// List all keys
const keys = await vault.list();

// Delete
await vault.delete('anthropic-key');
```

### Metadata tracking

Each credential carries metadata:

```ts
const cred = await vault.get('anthropic-key');
// → {
//     value: 'sk-ant-...',
//     provider: 'anthropic',
//     expiresAt: 1726123456789 (optional),
//     createdAt: 1726035056789,
//     lastUsedAt: 1726119456789 (optional)
//   }
```

Use `expiresAt` to detect stale tokens; `RotationOrchestrator` scans for tokens within a buffer window and triggers refresh.

### Token rotation (OAuth)

```ts
import { RotationOrchestrator, OAuthRotationHandler } from '@g4os/credentials/rotation';

const orchestrator = new RotationOrchestrator(vault, {
  intervalMs: 5 * 60 * 1000,      // scan every 5 min
  bufferMs: 5 * 60 * 1000,        // refresh if expiry < 5 min away
  handlers: [
    new OAuthRotationHandler({
      vault,
      tokenUrl: 'https://oauth.anthropic.com/token',
      clientId: process.env['ANTHROPIC_CLIENT_ID'],
      clientSecret: process.env['ANTHROPIC_CLIENT_SECRET'],
      fetch: globalThis.fetch, // injectable for testing
    }),
  ],
  onRotation: ({ key, provider, oldExpiresAt, newExpiresAt }) => {
    log.info({ key, provider, oldExpiresAt, newExpiresAt }, 'token refreshed');
  },
});

orchestrator.start();

// on graceful shutdown
orchestrator.dispose();
```

`OAuthRotationHandler` matches any key prefixed with `oauth.` and sends a `refresh_token` grant. Custom handlers implement `RotationHandler`:

```ts
class CustomRotationHandler implements RotationHandler {
  async canHandle(key: string): Promise<boolean> {
    return key.startsWith('custom.');
  }

  async rotate(currentValue: string): Promise<{ newValue: string; expiresAt?: number }> {
    const refreshed = await this.provider.refreshToken(currentValue);
    return { newValue: refreshed.access_token, expiresAt: refreshed.expires_in * 1000 + Date.now() };
  }
}
```

### v1 → v2 migration

```ts
import { migrateV1Credentials } from '@g4os/credentials/migration';

// Dry-run (non-destructive)
const report = await migrateV1Credentials({
  vault,
  v1EncPath: '/Users/user/.g4os/credentials.enc',
  v1Key: derivedKeyFromPassword, // user-supplied
  dryRun: true,
});
// → { keysProcessed: 15, keysMigrated: 14, keysFailed: 1, errors: [...] }

if (report.keysMigrated === report.keysProcessed) {
  // Actually migrate
  await migrateV1Credentials({
    vault,
    v1EncPath: '/Users/user/.g4os/credentials.enc',
    v1Key: derivedKeyFromPassword,
    dryRun: false,
  });
}
```

Migration is **idempotent**: running it twice does not duplicate keys. Already-migrated keys are skipped.

### Lifecycle (DisposableBase)

```ts
import { CredentialVault } from '@g4os/credentials';

const vault = await createVault({ mode: 'prod' });

// vault.dispose() cleans up file watchers and any pending I/O
// (called automatically during graceful shutdown)
await vault.dispose();
```

## Testing

```bash
pnpm --filter @g4os/credentials test
```

Test files in `src/__tests__/*.test.ts` cover:
- Vault CRUD (set, get, list, delete)
- Backup rotation (3x old backups retained)
- Atomic write failure recovery
- OAuthRotationHandler (refresh_token grant)
- RotationOrchestrator (DisposableBase, interval cleanup)
- v1→v2 migration (dry-run, idempotence, AES-256-GCM decryption)
- Metadata tracking (expiresAt, createdAt, lastUsedAt)

## Exports

```ts
import { CredentialVault, createVault }                       from '@g4os/credentials';
import { RotationOrchestrator, OAuthRotationHandler }          from '@g4os/credentials/rotation';
import { migrateV1Credentials }                               from '@g4os/credentials/migration';
import type { IVault, VaultBackend, RotationHandler }         from '@g4os/credentials';
```

## Boundary

`@g4os/credentials` may depend only on `@g4os/kernel`, `@g4os/platform`, and `electron` (dynamically imported for `safeStorage`). Enforced by `dependency-cruiser` rule `credentials-isolated`.
