# @g4os/kernel

Núcleo tipado sem dependências externas que todo o monorepo consome. Fonte única de verdade para tipos, schemas, erros e utilitários compartilhados.

## Sub-paths de importação

```ts
import { WorkspaceSchema, SessionSchema, MessageSchema } from '@g4os/kernel/schemas';
import type { Workspace, Session, Message }               from '@g4os/kernel/types';
import { AppError, CredentialError, ErrorCode }           from '@g4os/kernel/errors';
import { DisposableStore, toDisposable, DisposableBase }  from '@g4os/kernel/disposable';
import { createLogger }                                   from '@g4os/kernel/logger';
import { parseSchema, getEnv, EnvSchemas }                from '@g4os/kernel/validation';
```

## Schemas Zod (validação runtime)

Toda fronteira (IPC, storage, forms) valida com schemas. Nunca passar dados nao-validados entre camadas.

```ts
import { WorkspaceSchema } from '@g4os/kernel/schemas';

const workspace = WorkspaceSchema.parse(rawJson);
// workspace.defaults.permissionMode === 'ask' (default aplicado)
// workspace.metadata === {} (default aplicado)
```

## Result pattern (neverthrow)

Erros esperados sao `Result<T, AppError>`, nao throws. Use `toResult()` para wrappar promises legadas.

```ts
import { err, ok } from 'neverthrow';
import { CredentialError, ErrorCode, toResult } from '@g4os/kernel/errors';

async function getApiKey(key: string): Promise<Result<string, CredentialError>> {
  const raw = await vault.read(key);
  if (!raw) return err(CredentialError.notFound(key));
  return ok(raw);
}

// Consumo
const result = await getApiKey('anthropic-key');
if (result.isErr()) {
  if (result.error.code === ErrorCode.CREDENTIAL_NOT_FOUND) { /* prompt login */ }
  return;
}
const apiKey = result.value;
```

### Classes de erro por domínio

| Classe | Prefixo | Factory methods |
|---|---|---|
| `CredentialError` | `credential.*` | `notFound`, `locked`, `decryptFailed` |
| `AuthError` | `auth.*` | `notAuthenticated`, `tokenExpired`, `otpInvalid`, `entitlementRequired` |
| `IpcError` | `ipc.*` | `handlerNotFound`, `invalidPayload`, `timeout` |
| `SessionError` | `session.*` | `notFound`, `corrupted`, `locked` |
| `AgentError` | `agent.*` | `unavailable`, `rateLimited`, `invalidInput`, `network` |
| `SourceError` | `source.*` | `notFound`, `authRequired`, `incompatible` |
| `FsError` | `fs.*` | `accessDenied`, `notFound`, `diskFull` |

## Disposable pattern

Toda classe que registra listeners, timers, subprocessos ou conexões DEVE implementar `IDisposable`. Isso previne o vazamento de memoria que causava travamentos no Windows.

```ts
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';

class ChatController extends DisposableBase {
  constructor(session: Session) {
    super();
    // Listener com cleanup automático
    const handler = (msg: Message) => this.handleMessage(msg);
    session.on('message', handler);
    this._register(toDisposable(() => session.off('message', handler)));

    // Timer
    const id = setInterval(() => this.flush(), 5000);
    this._register(toDisposable(() => clearInterval(id)));
  }
  // Quando o componente e destruído:
  // ctrl.dispose() — descarta TODOS os recursos registrados
}
```

## Logger estruturado (pino)

```ts
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('auth');
log.info({ userId: 'u-1', operation: 'login' }, 'user logged in');
log.error({ err: error.toJSON(), workspaceId: 'w-1' }, 'failed');

// Child logger com contexto persistente
const sessionLog = log.child({ sessionId: 's-42' });
sessionLog.info({ durationMs: 150 }, 'message processed');
```

Dados sensíveis (`apiKey`, `accessToken`, `password`, etc.) sao redacted automaticamente.

## Validation helpers

```ts
import { parseSchema, getEnv, EnvSchemas } from '@g4os/kernel/validation';
import { WorkspaceSchema } from '@g4os/kernel/schemas';

// Parse com Result (nao lança exceção)
const result = parseSchema(WorkspaceSchema, unknownData, 'config file');
if (result.isErr()) { /* result.error.context.issues */ }

// Env vars tipadas com fail-fast em startup
const port = getEnv('PORT', EnvSchemas.port);
const logLevel = getEnv('LOG_LEVEL', EnvSchemas.logLevel);
```

## Serialization (JSON / JSONL)

```ts
import { deserializeJsonl } from '@g4os/kernel';
import { SessionEventSchema } from '@g4os/kernel/schemas';

// Cada linha JSONL e validada independentemente
const events = deserializeJsonl(SessionEventSchema, fileContent);
```

## Dependências runtime

| Pacote | Versão | Motivo |
|---|---|---|
| `zod` | `^4.0.0` | Schemas com inferência de tipos |
| `neverthrow` | `8.2.0` | Result<T, E> pattern |
| `pino` | `10.3.1` | Logger JSON estruturado |
| `pino-pretty` | `13.1.3` | Output legível em desenvolvimento |
