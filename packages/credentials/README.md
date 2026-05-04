# @g4os/credentials

Camada de credenciais: armazenamento seguro (Electron `safeStorage` + escrita atômica + rotação de backup), migração v1→v2 não-destrutiva e refresh OAuth plugável via `RotationOrchestrator`.

## Sub-paths de importação

```ts
import {
  CredentialVault,
  createVault,
  type VaultMode,
  type CreateVaultOptions,
  type CredentialMeta,
  type SetOptions,
} from '@g4os/credentials';
import {
  RotationOrchestrator,
  OAuthRotationHandler,
  type RotationHandler,
} from '@g4os/credentials/rotation';
import { migrateV1ToV2 } from '@g4os/credentials/migration';
```

## Módulos

- **`vault.ts`** — classe `CredentialVault` (mutex + escrita atômica + rotação de 3x backups + metadata por chave)
- **`factory.ts`** — `createVault({ mode })` (`prod` / `dev` / `test`)
- **`backends/`** — implementações:
  - `memory.ts` (in-memory, testes)
  - `file.ts` + `codec.ts` (arquivo com codec AES-256-GCM)
  - `safe-storage.ts` (Electron `safeStorage` via import dinâmico para evitar dep runtime)
- **`rotation/`** — orquestração de refresh assíncrono:
  - `handler.ts` — interface `RotationHandler`
  - `oauth-handler.ts` — handler genérico RFC-6749 `refresh_token`
  - `orchestrator.ts` — `RotationOrchestrator extends DisposableBase` (scan periódico, handlers plugáveis)
- **`migration/`** — migração v1→v2 em dry-run, idempotente (descriptografa `credentials.enc` legado com AES-256-GCM)

## Stack

- [`@g4os/kernel`](../kernel) (schemas, Result pattern, DisposableBase, logger)
- [`@g4os/platform`](../platform) (paths, abstração de keychain)
- `electron` (dinâmico, apenas para `safeStorage` e `app.getName`)
- `node:crypto` (nativo, sem bindings externos)

## ADRs principais

- **ADR-0050:** API do CredentialVault (mutex + 3x backups + metadata)
- **ADR-0051:** Backends + `safeStorage` do Electron
- **ADR-0052:** Migração v1 → v2 (não-destrutiva + idempotente)
- **ADR-0053:** Rotação de credenciais (handlers plugáveis + orquestrador DisposableBase)

## Uso

### Instanciar o vault

```ts
import { createVault } from '@g4os/credentials';

// Produção (usa safeStorage, escrita atômica, 3x backups)
const vault = await createVault({ mode: 'prod' });

// Desenvolvimento (file-based com codec, backup único)
const vault = await createVault({ mode: 'dev' });

// Teste (in-memory, sem I/O)
const vault = await createVault({ mode: 'test' });
```

### Guardar e ler segredos

```ts
import { CredentialError, ErrorCode } from '@g4os/kernel/errors';

// Guardar (criptografa, escrita atômica, cria backup)
await vault.set('anthropic-key', 'sk-ant-...', {
  provider: 'anthropic',
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // opcional
});

// Recuperar
const result = await vault.get('anthropic-key');
if (result.isErr()) {
  if (result.error.code === ErrorCode.CREDENTIAL_NOT_FOUND) { /* re-logar */ }
  throw result.error;
}
const key = result.value;

// Listar chaves
const keys = await vault.list();

// Apagar
await vault.delete('anthropic-key');
```

### Rotação de token (OAuth)

```ts
import { RotationOrchestrator, OAuthRotationHandler } from '@g4os/credentials/rotation';

// Assinatura real: new RotationOrchestrator({ vault, handlers, intervalMs, bufferMs })
// Telemetria separada via setTelemetry(). Instanciado na composition root
// (apps/desktop/src/main/) após createVault().
const orchestrator = new RotationOrchestrator({
  vault,
  intervalMs: 5 * 60 * 1000,   // scan a cada 5 min
  bufferMs: 5 * 60 * 1000,     // refresh se expiração < 5 min
  handlers: [
    new OAuthRotationHandler({
      tokenUrl: 'https://oauth.example.com/token',
      clientId: resolvedClientId,   // injetado via DI, nunca process.env direto
    }),
  ],
});

// Telemetria opcional (injetada separadamente)
orchestrator.setTelemetry({
  onRotation: ({ key, status }) => log.info({ key, status }, 'token rotacionado'),
  onScan: ({ scanned, expiring }) => log.debug({ scanned, expiring }, 'scan de rotação'),
});

orchestrator.start();

// no shutdown (AppLifecycle.onQuit)
orchestrator.dispose();
```

### Migração v1 → v2

```ts
import { migrateV1ToV2 } from '@g4os/credentials/migration';

// Dry-run (não-destrutivo)
const report = await migrateV1ToV2({
  vault,
  masterKey: derivedKeyFromPassword,
  v1Path: '/Users/user/.g4os/credentials.enc', // opcional, default detectado
  dryRun: true,
});

if (report.failed === 0) {
  await migrateV1ToV2({ vault, masterKey: derivedKeyFromPassword });
}
```

Migração é **idempotente**: rodar duas vezes não duplica chaves.

## Testes

```bash
pnpm --filter @g4os/credentials test
```

Cobertura inclui: CRUD do vault, rotação de backups, recovery em falha de escrita, OAuthRotationHandler, RotationOrchestrator (DisposableBase), migração v1→v2 (dry-run + idempotência + AES-256-GCM).

## Fronteira

`@g4os/credentials` pode depender apenas de `@g4os/kernel`, `@g4os/platform` e `electron` (dinâmico, para `safeStorage`). Garantido pela regra `credentials-isolated` do `dependency-cruiser`.
