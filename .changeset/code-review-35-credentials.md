---
'@g4os/credentials': patch
'@g4os/ipc': patch
'@g4os/desktop': patch
---

Code Review 35 — packages/credentials — auditoria exaustiva (12 findings).

Foco: CredentialVault gateway, backends (in-memory/file/safeStorage), migrator V1→V2, RotationOrchestrator + OAuth handler, paridade com call-sites no main app, drift de schemas IPC vs vault, namespace collision em chaves, dead-code de bootstrap. Cita ADRs 0011 (Result), 0012 (Disposable), 0050 (vault API), 0051 (backends/safeStorage), 0052 (migration), 0053 (rotation), 0153 (catalog).

---

## F-CR35-1 — RotationOrchestrator nunca instanciado em produção (HIGH)

**Path:** `apps/desktop/src/main/index.ts:148-150` (e ausência em qualquer outro arquivo de bootstrap).

**Root cause:** ADR-0053 manda o caller (`apps/desktop/src/main/*`) instanciar `RotationOrchestrator`, registrar `OAuthRotationHandler`, chamar `start()` após login e `dispose()` no graceful shutdown (ADR-0032). `grep -rn "new RotationOrchestrator" apps/` retorna **zero** matches. O bootstrap só faz `createVault({ mode })`. Resultado: toda a infraestrutura de rotação (`packages/credentials/src/rotation/*`, ~270 LOC + 6 testes) é dead code em runtime. Tokens OAuth de sources gerenciados (Gmail/Google/Slack/etc.) com `expiresAt` no vault NUNCA são refreshados preventivamente — usuário só vê a falha quando provider retorna `401` dentro de uma sessão ativa, exatamente o sintoma V1 que o ADR-0053 propôs eliminar ("Token expirado no meio do chat causava erro em runtime após horas de sessão").

`SessionRefresher` em `@g4os/auth` cobre apenas o token Supabase do app (`AUTH_REFRESH_TOKEN_KEY`), não credenciais de sources. `OAuthRotationHandler` está pronto, com handler de erros tipados e timeout de 30s — só falta o wire.

**Fix:** instanciar `RotationOrchestrator` em `main/index.ts` após `createVault`, registrar `OAuthRotationHandler` por provider OAuth ativo, registrar `dispose()` no `AppLifecycle.onQuit`, chamar `start()` após autenticação. Tarefa probably MEDIUM-effort (decidir handlers/tokenUrls por provider gerenciado).

**ADRs:** 0053 (orchestrator), 0050 (expiresAt), 0032 (graceful shutdown).

---

## F-CR35-2 — IPC `credentials.rotate` perde `expiresAt`, recriando bug ADR-0050 (MAJOR)

**Path:** `packages/ipc/src/server/routers/credentials-router.ts:64-70` + `apps/desktop/src/main/services/credentials-service.ts:77-82`.

**Root cause:** O método `CredentialVault.rotate(key, newValue, options)` aceita `SetOptions` justamente porque o vault.ts:148-154 documenta que rotate sem novo `expiresAt` deixa meta com expiry vencido — re-disparando o handler em loop ("CR-30 / vault.ts:148-154"). Mas a IPC router não expõe `options` no schema (`z.object({ key, newValue })`), e a `VaultCredentialsService.rotate` chama `this.#vault.rotate(key, newValue)` sem forward de options. Caller via tRPC (Settings UI) que rotacionar token OAuth fica com expiry stale → próximo scan do orchestrator (quando F-CR35-1 for fixado) re-dispara em loop. Mesmo bug que ADR-0050 fechou no vault, reintroduzido na borda IPC.

**Fix:** adicionar `options: CredentialSetOptionsSchema.optional()` ao schema do `rotate`, propagar via `CredentialsService.rotate(key, newValue, options?)` no contract e na implementação.

**ADRs:** 0050 (vault API), 0011 (Result).

---

## F-CR35-3 — `CredentialKeySchema` IPC aceita 200 chars; vault rejeita >100 (MAJOR)

**Path:** `packages/ipc/src/server/routers/credentials-router.ts:6` (`z.string().min(1).max(200)`) vs `packages/credentials/src/vault.ts:35` (`KEY_MAX_LENGTH = 100`) e `packages/kernel/src/schemas/credential.schema.ts:13` (`max(100)`, comentário CR-18 F-C4).

**Root cause:** Mesmo bug que CR-18 F-C4 fechou em `CredentialMetaSchema`: schema IPC fica drift com o vault. Caller passa key de 150 chars, Zod do router aceita, `ctx.credentials.set` chama vault, vault retorna `invalidKey` em runtime — UX ruim (erro só no fundo da pilha) e mensagem genérica. Essa regressão é estrutural — o "max(200)" foi mantido fora da correção CR-18.

**Fix:** trocar `CredentialKeySchema` para `z.string().regex(/^[a-z0-9._-]+$/).min(1).max(100)` (espelho exato do `KEY_PATTERN` + `KEY_MAX_LENGTH` do vault). Idealmente extrair pra `@g4os/kernel/schemas/credential.schema.ts` como `CredentialKeySchema` exportada e consumida em ambas pontas.

**ADRs:** 0050 (key validation), 0153 (centralization — mesmo princípio, aplicado a schemas).

---

## F-CR35-4 — IPC sem validação de `value`/`tags` (drift do vault) (MEDIUM)

**Path:** `packages/ipc/src/server/routers/credentials-router.ts:7-12,33-39`.

**Root cause:** Schema IPC define `value: z.string()` (sem max), `tags: z.array(z.string()).optional()` (sem `max(32)`, sem string `min(1).max(64)`). Vault aplica `VALUE_MAX_LENGTH = 1_000_000` e `MAX_TAGS = 32` + `TAG_MAX_LENGTH = 64`. Caller via tRPC pode mandar payload de 50 MB de string ou array de 1000 tags — electron-trpc/superjson tenta serializar (custo memory, possível DoS local), só pra vault rejeitar com erro genérico. Mesmo padrão do F-CR35-3.

**Fix:** alinhar IPC schema com constantes do vault: `value: z.string().min(1).max(1_000_000)`, `tags: z.array(z.string().min(1).max(64)).max(32).optional()`. Idealmente extrair os limits para `credential.schema.ts` como constantes compartilhadas.

**ADRs:** 0050, 0011.

---

## F-CR35-5 — Namespace collision: chave user-set `foo.meta` / `foo.backup-X` clobbra metadata e backup (MEDIUM)

**Path:** `packages/credentials/src/vault.ts:27-29,203-205,290-297`.

**Root cause:** `META_SUFFIX = '.meta'` e `BACKUP_SEPARATOR = '.backup-'` ocupam o mesmo namespace de chave do usuário. `KEY_PATTERN = /^[a-z0-9._-]+$/` aceita `.` e `-`, então `vault.set('app.meta', 'x')` é válido. Sequência destrutiva:

1. `vault.set('app', 'v1')` → `keychain.set('app', 'v1')` + `keychain.set('app.meta', JSON.stringify(meta))`.
2. `vault.set('app.meta', 'meu-segredo')` → `keychain.set('app.meta', 'meu-segredo')` (sobrescreve a meta de `app`!) + `keychain.set('app.meta.meta', ...)`.
3. Subsequente `vault.list()` filtra `'app.meta'` (ends with `.meta`), então some da UI. `vault.get('app.meta')` retorna o secret OK (skip de meta válida pelo `safeParse`?). Mas `app` agora tem meta corrompida/sobrescrita.

Pior: `vault.set('foo.backup-123', 'x')` cria entry filtrada de `list()` E pode colidir com backup real de `foo` (ts próximo). Também aplicável a chave reservada para refresh token: `vault.set('oauth.google.refresh_token', ...)` é válido mas se houver chave `'oauth.google'` com refresh token migrado, há risco de duas semânticas.

ADR-0050 não menciona reserva de sufixo.

**Fix:** validar em `validateKey()` que `key` não termina em `META_SUFFIX` e não contém `BACKUP_SEPARATOR`. Adicionar testes regressivos. Considerar prefixo reservado (`__internal__`) em vez de sufixo + filtro.

**ADRs:** 0050.

---

## F-CR35-6 — `set()` zera tags silenciosamente (vs `rotate()` preserva) (MEDIUM)

**Path:** `packages/credentials/src/vault.ts:114-120` (set) vs `vault.ts:178-185` (rotate).

**Root cause:** Em `set(key, value)` sem `options.tags`, a meta é gravada com `tags: Object.freeze([...(options.tags ?? [])])` — array VAZIO. Em `rotate(key, value)` sem `options.tags`, fallback é `existing.isOk() ? [...existing.value.tags] : []` — preserva tags. API é inconsistente:

- Migrator grava entries com `tags: ['migrated-from-v1']`.
- Settings UI chama `credentials.set` para atualizar valor → tags somem silenciosamente. `migrated-from-v1` perdido após primeira edição manual.
- Source secrets em `services/sources/secrets.ts:112` gravam com `tags: ['source', workspaceId, slug, bucket]`. Próximo `set` (ex.: rotação manual de bearer token via UI) limpa tudo — operador perde rastreabilidade workspace/slug/bucket.

Comportamento não documentado em ADR-0050 ("API set/get/delete/rotate"). Drift entre operações estruturalmente similares.

**Fix:** alinhar `set()` ao mesmo fallback do `rotate()` (preservar tags se `options.tags === undefined`). Documentar no ADR-0050 o contrato. OU expor flag explícita `replaceTags?: boolean` para semântica clara em ambos.

**ADRs:** 0050.

---

## F-CR35-7 — `FileKeychain.ensureReady` cacheia rejeição perpetuamente (MEDIUM)

**Path:** `packages/credentials/src/backends/file-backend.ts:119-131`.

**Root cause:** `ensureReady()` cria `this.readyPromise = mkdir(...).then(() => undefined)` na primeira chamada. Se mkdir REJEITA (EACCES temporário, FS de rede flapando, dir bloqueado), o promise rejeitado fica cached em `this.readyPromise`. Toda chamada subsequente retorna `err(ioError)` mesmo após o problema ser resolvido. Único reset é restart do processo.

Sintoma operacional: usuário em macOS com Disk Full Protection abre app durante popup de permissão de FS, mkdir falha, popup é aceito 10s depois — vault permanece poison até quit. Sem visibilidade clara além do log.warn de cada call.

**Fix:** invalidar `readyPromise` em rejeição: usar `try/catch` em torno do await + setar `this.readyPromise = null` no caminho de erro, OR lift retry policy para `getOrAwaitReady()`.

**ADRs:** 0011 (Result), 0051 (file backend).

---

## F-CR35-8 — `loadSafeStorageCodec` não valida shape do módulo (MEDIUM)

**Path:** `packages/credentials/src/backends/safe-storage-codec.ts:25-35`.

**Root cause:** Cast direto `(await import(SPECIFIER)) as ElectronLike` sem checar `mod?.safeStorage?.isEncryptionAvailable`. Se electron foi importado num contexto onde safeStorage não está exposto (versão antiga, runtime não-Electron, mock incompleto em testes), `store.isEncryptionAvailable()` lança `TypeError: store.isEncryptionAvailable is not a function`. Esse throw escapa do `FileKeychain.set` (não há try/catch em volta do `this.codec.available` em `ensureReady`). Resultado: `vault.set()` retorna promise rejeitada com TypeError em vez de `Result.err`, violando ADR-0011 (erros esperados são tipos, não exceptions).

`encryptString`/`decryptString` chamados via `this.codec.encrypt(value)` ESTÃO em try/catch (file-backend.ts:51-55), mas o getter `available` em safe-storage-codec.ts:29-31 chama `store.isEncryptionAvailable()` sem guarda — se shape estiver errado, throw síncrono no getter.

**Fix:** validar shape em `loadSafeStorageCodec` (early return de codec com `available: false` se assertion falhar). Wrapping defensivo no getter `available` com try/catch (return `false` em caso de exception).

**ADRs:** 0051, 0011.

---

## F-CR35-9 — `CredentialMetaView` IPC drop silencioso de `stale: true` (MEDIUM)

**Path:** `packages/ipc/src/server/context-services.ts:207-213` + `packages/ipc/src/server/routers/credentials-router.ts:14-20` + `apps/desktop/src/main/services/credentials-service.ts:67-73`.

**Root cause:** Vault marca entries com meta corrompida como `stale: true` (vault.ts:213-225, "operador vê via debug-export ou Settings → Repair"). `CredentialMetaView` da IPC NÃO tem campo `stale`. `VaultCredentialsService.list` mapeia da `CredentialMeta` para `CredentialMetaView` sem propagar `stale`. UI nunca vê o sinal — operador não tem como acionar repair. Comentário no vault.ts:213 menciona "Settings → Repair" que não existe (`grep -rn "Repair" apps/desktop/src/renderer` retorna zero matches relacionado a creds).

Resultado: a heurística "stale" do vault é dead-data — funciona no código, não atravessa a fronteira. Operador continua sem sinal visível para repair manual após corrupção.

**Fix:** adicionar `stale?: boolean` em `CredentialMetaView` + propagar no `VaultCredentialsService.list`. Adicionar campo no Zod output schema do router. Usar em qualquer panel de settings que consuma a list.

**ADRs:** 0050.

---

## F-CR35-10 — Migrator usa `existsSync` (sync FS no main process) + TOCTOU (LOW)

**Path:** `packages/credentials/src/migration/migrator.ts:14,63`.

**Root cause:** `existsSync(v1Path)` é sync FS no main thread Electron. ADR-0032 (graceful shutdown) e a guideline geral evitam sync FS porque congela event loop. Para arquivo único é microssegundos, mas é ruído estrutural — dependency-cruiser não pega isso.

Adicional: TOCTOU clássico — após `existsSync` retornar true, arquivo pode ser deletado antes do `readFile` async em `readV1Credentials`. Migrator trata o erro ("read-v1") mas aceita-se TOCTOU silente.

**Fix:** trocar para `await stat(v1Path)` em try/catch (ENOENT é o sinal). Mantém async-only no main.

**ADRs:** 0032 (graceful shutdown / no-sync-fs).

---

## F-CR35-11 — `backupCurrent` colide em `Date.now()` mesmo-ms (LOW)

**Path:** `packages/credentials/src/vault.ts:269-298`.

**Root cause:** `backupName = ${key}${BACKUP_SEPARATOR}${Date.now()}`. Mutex impede concorrência simultânea, mas duas escritas back-to-back no mesmo `set()` + `delete()` consecutivos podem colidir em `Date.now()` (resolução ms; runtime de cada call é sub-ms). Segundo backup sobrescreve o primeiro silenciosamente (`keychain.set` overwrites). Reduz histórico efetivo de 3 → 2 quando há rajada.

ADR-0050 promete "histórico de 3 versões por chave cobre rollback manual"; em rajada real (set + delete em <1ms), entrega 2.

**Fix:** sufixo aleatório (8 bytes hex via `randomBytes`) ou contador per-key. Mesmo padrão usado em `writeAtomic` (kernel/fs/atomic-write.ts:50).

**ADRs:** 0050.

---

## F-CR35-12 — README.md drift (`migrateV1Credentials`/`createVault` config inválida) (LOW)

**Path:** `packages/credentials/README.md:21,98-115,126-138`.

**Root cause:** README importa `migrateV1Credentials` (não existe — export real é `migrateV1ToV2`). O exemplo de `RotationOrchestrator` usa shape antigo (`new RotationOrchestrator(vault, { handlers, intervalMs, bufferMs, onRotation })` — assinatura real é `new RotationOrchestrator({ vault, handlers, intervalMs, bufferMs })` + `setTelemetry(...)` separado). Exemplo lê `process.env['ANTHROPIC_CLIENT_ID']` violando `noProcessEnv: error` (CLAUDE.md regra).

`migrateV1Credentials` em copy-paste do README se compilado quebra. Regressão estrutural pra qualquer engenheiro que use README como referência.

**Fix:** sincronizar README com APIs reais. Trocar `process.env` por exemplo de injeção via composition-root.

**ADRs:** 0153 (catalog principle aplicado a docs também — single source of truth).

---

### Áreas auditadas e validadas (sem findings)

- `vault.ts` — mutex (`async-mutex`), backup retention 3x, expiry auto-delete, `readMeta` com Zod safeParse + `stale` flag, `writeMeta` propaga erro, `validateTags` (CR-18 F-C4), `validateValue` empty/long, `KEY_PATTERN` sem flag `i` (anti-homoglyph).
- `file-backend.ts` — `writeAtomic` com mode 0o600, base64url encoding, ENOENT como `notFound`, separação `decryptFailed` (crypto) vs `ioError` (mkdir/IO) — CR-18 F-C5 fix presente.
- `migrator.ts` — sanitizeKey lowercase + `.toLowerCase()` (CR-18 F-C1 fix), `targetMap` para colisão pre-write, `migrateRefreshToken` checa exists antes de set (proteção single-use), Zod safeParse em `V1CredentialsSchema`, `writeAtomic` no reportPath (F-CR32-4).
- `oauth-handler.ts` — `OAuthTokenResponseSchema` Zod, AbortController + 30s timeout, `OAuthRotationError` discriminated union (`timeout|http_error|network|refresh_token_missing`), `CLOCK_SKEW_BUFFER_SECONDS = 60`, refresh token resolvido via slot `<key>.refresh_token` (CR-18 F-C2).
- `orchestrator.ts` — `DisposableBase` com `_register(toDisposable(clearInterval))`, `timer.unref()`, `scanInflight` guard contra parallel scan, `rotationsInflight` Map para coalesce per-key (proteção contra refresh token single-use queimar em chamadas paralelas externas).
- Boundary cruiser `credentials-isolated` (kernel/platform/credentials only) — sem violações.
- Logging — nenhum vault method loga `value` ou `masterKey`. PII em paths logado em `migrator.ts:64,77` (`v1Path` contém `/Users/<user>/.g4os/credentials.enc`) é aceitável (path operacional + scrub.ts cobre Sentry).
- Vault keys em call-sites: `anthropic_api_key`, `openai_api_key`, `google_api_key` (`agents-bootstrap.ts:33,39,45`), `auth.access-token`, `auth.refresh-token`, `auth.session-meta` (`@g4os/auth/types.ts:87-89`), `oauth.<provider>` + `oauth.<provider>.refresh_token` (oauth-handler convention). Todas válidas pelo `KEY_PATTERN` lowercase. CR-30 F-CR30-1 (`'connection.anthropic-direct.apiKey'` → `'anthropic_api_key'`) confirmado fixado em `title-generator.ts:52`.
- Persistência atômica via `writeAtomic` em FileKeychain. Mode 0o600 em arquivo + `chmod` defensivo no fallback EXDEV.
- Result pattern (ADR-0011) — todas as APIs públicas retornam `Promise<Result<T, CredentialError>>` ou `Promise<MigrationReport>`/`Promise<boolean>` (rotation orchestrator é interno). Zero `try/catch` no caminho feliz.
- Disposable (ADR-0012) — `RotationOrchestrator extends DisposableBase`, `setInterval` registrado via `toDisposable(clearInterval)` + `timer.unref()`. Sem watchers/listeners crus.
- TS strict / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` — cast explícito em `parsed.data as V1Credentials` documentado (`v1-reader.ts:75-77`); spread `...(options.expiresAt === undefined ? {} : { expiresAt })` segue padrão `exactOptionalPropertyTypes`. Sem `any`, sem `@ts-ignore`. Sem `console.*`, sem `TODO`/`FIXME`.
- 25 testes unitários passando (vault 8 + backends 5 + rotation 6 + migration 6). Cobertura inclui CR-18 F-C1/C2/C4/C5 regressions.

### Severidade

- **HIGH:** 1 (F-CR35-1)
- **MAJOR:** 2 (F-CR35-2, F-CR35-3)
- **MEDIUM:** 5 (F-CR35-4, F-CR35-5, F-CR35-6, F-CR35-7, F-CR35-8, F-CR35-9)
- **LOW:** 3 (F-CR35-10, F-CR35-11, F-CR35-12)

Total: **12 findings** em `packages/credentials` + adjacências (IPC router, IPC contract, README).
