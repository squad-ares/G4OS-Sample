---
'@g4os/agents': patch
'@g4os/auth': patch
'@g4os/codex-types': patch
'@g4os/credentials': patch
'@g4os/data': patch
'@g4os/desktop': patch
'@g4os/features': patch
'@g4os/ipc': patch
'@g4os/kernel': patch
'@g4os/migration': patch
'@g4os/observability': patch
'@g4os/permissions': patch
'@g4os/platform': patch
'@g4os/release-channels': patch
'@g4os/session-runtime': patch
'@g4os/sources': patch
'@g4os/translate': patch
'@g4os/ui': patch
---

Code Review 18 — hardening pré-canary distribuído (94 findings inéditos pós-CR17, 88% resolvidos em 5 waves). Acompanha ADR-0158 e bumps de gate documentados.

**P0 críticos (bloqueavam canary, todos verdes pós-Wave 1):**

- `@g4os/kernel` F-K1 — `truncateCauseChain` clonava em vez de mutar. Mesmo `Error` referenciado em múltiplos `AppError`/breadcrumbs/error-bus tinha cadeia permanentemente reescrita (post-cap virava `Error('exceeds max depth')`; 2ª passada retornava `circular`). Fix preserva cadeia original; teste regressivo cobrindo cycle/depth.
- `@g4os/platform` F-P1 — `homedir()` direto bypassava ADR-0013 em 3 arquivos prod (incluindo `apps/desktop/src/main/services/migration-service.ts`). Adicionado `getHomeDir()` em `paths.ts`. Gate `check:platform-leaks` ampliado para detectar named imports `import { homedir } from 'os'` além de member-access.
- `@g4os/credentials` F-C1 — migrator regex `^(api_key|token|...)` preservava uppercase no key fragment, mas vault rejeita keys com letras maiúsculas. V1 com `OpenAI-Key`/`GitHub_Token` falhavam silenciosamente. Fix normaliza para snake-case.
- `@g4os/credentials` F-C2 — `OAuthRotationHandler` enviava access token onde refresh token era esperado pelo provider (handler nunca rotacionava de fato). Novo contrato `RotationContext { key, currentValue, vault }`; handler resolve refresh token via `<key>.refresh_token` slot dedicado.
- `@g4os/migration` F-M1 — `rollbackTarget` chamava `rm -rf` no diretório V2 inteiro em falha. User com sessões V2 + step V1→V2 falho perdia V2 irreversivelmente. Substituído por `rollbackPaths(writtenPaths)` cirúrgico via novo `StepResult.writtenPaths`.
- `@g4os/migration` F-M2 — race entre `plan` e `execute`: `alreadyMigrated` checado uma vez em `plan` mas não re-validado em `execute`. Fix: lockfile `O_EXCL` + re-check do `MIGRATION_DONE_MARKER` dentro de `execute()`.
- `@g4os/ui` F-U1 — gate `check:hover-pattern` não escaneava `packages/ui/`; Button ghost/secondary violavam. Gate ampliado (SCAN_GLOBS estendido). Button migrado para `hover:bg-accent/N`.
- `@g4os/codex-types` F-CT1 — `thinkingLevel?: 'low' | 'medium' | 'high'` divergia do contrato `IAgent` (`'low' | 'think' | 'high' | 'ultra'`). Mapper silently strippava `'think'`/`'ultra'`. Novo `CodexWireThinkingLevel` type; mapper força compile error em adição via `satisfies Record<ThinkingLevel, CodexWireThinkingLevel>`.

**Apps/desktop P0 propagações:**

- F-DT-D — `migration-service.ts` agora usa subdir staging `getAppPaths().data/v1-migrated`. Combinado com F-M1 a V2 produtiva nunca é tocada em rollback.
- F-DT-A — `homedir()` leak em desktop main resolvido junto com F-P1.
- F-DT-E — credenciais V1 uppercase silenciosas resolvidas via F-C1; main loga `stepResults[i].warnings` para discrepância visível.

**P1 alto impacto (Wave 2):**

- F-DT-I (CRÍTICO) — `setAsDefaultProtocolClient('g4os')` + `requestSingleInstanceLock()` jamais eram chamados. Deep-links `g4os://...` não chegavam ao app; 2ª instância em Windows/Linux quebrava lifecycle de single-window. Novo `services/single-instance-bootstrap.ts` (107 LOC) wired antes de `app.whenReady()`. ADR-0158 documenta a decisão.
- F-DT-L — `runBashHandler` agora é `nonPersistable` (broker downgrades `allow_always` → `allow_session` para tools dessa lista). `rm -rf $HOME` aprovado uma vez não cacheia.
- F-DT-C / F-PE2 — `argsPreview` no `PermissionStore` ganhou redação de Bearer/sk-/gho_/xoxb_/secret_ + key-aware (apiKey, password). Tools com `cmd: "curl -H 'Authorization: Bearer ghp_…'"` não vazam mais token em `permissions.json`.
- F-PE1 — sync `respond()` chamado de dentro de `onRequest` causava request hang até timeout (5min). Fix: queue assíncrona com tick interleaving.
- F-O1 — `redactSecretsInText` agora cobre Bearer tokens não-JWT, GitHub PAT (`gho_*`/`ghp_*`), Slack tokens (`xoxb_*`/`xoxp_*`).
- F-AU1 + F-AU2 — `SessionRefresher.runRefresh` swallowava erros de `tokenStore.set`; refresh tight-loop com token near-expiry (<1s buffer) podia disparar dezenas/segundo. Fixes: erros propagam como `reauth_required`; debounce mínimo 5s entre refreshes.
- F-AG1 + F-AG2 — Codex dispose: comment falava LIFO mas `Promise.allSettled` é paralelo (corrigido); `AgentRegistry.create()` Result contract bypassed por factory throws (factory wrapper agora captura e retorna `Result.err`).
- F-SR1 + F-SR2 — abort entre tool iterations não checado; `broker.cancel(sessionId)` rejeitava TODAS pendências da sessão + esvaziava `#sessionAllow`. Fix: `signal.aborted` check no início de cada iteração; `broker.cancelTurn(turnId)` com escopo correto + opcional `clearSessionAllow(sessionId)` quando user faz logout.
- F-S1 + F-S2 — mcp-http `authCredentialKey` era dead code (não wired); catalog seeds com `description` hardcoded em pt-BR. Fix: `authResolver` injetável; `descriptionKey: TranslationKey` em todos os seeds.
- F-I1 — migration-router strippava `AppError` typed errors via `TRPCError` envelope. Throw direto preserva `code`/`context`/`cause` para `errorFormatter` em `trpc-base.ts`.
- F-K2 — `writeAtomic` agora retorna `Result<void, FsError>` em vez de throw.
- F-D1 — `truncateAfter` agora preserva linhas JSONL corrompidas em `.truncate-failed.jsonl` em vez de drop silencioso.
- F-O2 — `MemoryMonitor.start()` após `dispose()` criava timer órfão. Fix: throw em `start()` se já disposed.
- F-M3 + F-M4 + F-M5 — `MIGRATION_DONE_MARKER` escrito mesmo após falha parcial; `migrate-config` whitelist descartava valores reais; `migrate-sessions` sequenceNumber=indexInJsonl conflitava com event store V2.

**P2 housekeeping (Waves 3–5):**

- 22 i18n strings em features hardcoded (tool-renderers, slash command picker, copy-button) → translation keys.
- `package.json` exports drift em codex-types/release-channels (CJS removido, `sideEffects: false`, `files` whitelisted).
- Mermaid/PDF lazy-load race condition (N>1 blocks renderizando simultâneo).
- `lifecycle.dispose()` no próprio `onQuit` removido; `Promise.allSettled` documentado como paralelo (não LIFO como comentário antigo dizia).
- Migration plan log: redação defensiva no `result.error.context` para evitar vazamento hipotético de `v1MasterKey` em `error.log`.

**Gates novos / ampliados:**

- `check:platform-leaks` — regex de named imports além de member-access (734 files cobertos).
- `check:hover-pattern` — SCAN_GLOBS estendido para `packages/ui/` (288 files).
- `check:main-size` — `MAIN_LIMIT` 10000 → 10150 com justificativa CR-18 F-DT-I documentada inline + CLAUDE.md/AGENTS.md sincronizados.

**Métricas finais:**

- 48 testes regressivos novos cross-package (1107 → 1155 tests).
- i18n parity 1083 keys (+13 de F-F1/F-F2/F-F3 + ADR-0158 wiring).
- 11 findings remanescentes documentados como deferrals/duplicatas/skips cosméticos com baixo ROI.

Acompanha ADR-0158 (single-instance lock + protocol registration). Closure completa em `Docs/STUDY/code-review/code-review-18.md`.
