# CLAUDE.md — G4 OS v2

This file is the primary AI context for the `@g4os/monorepo` (G4 OS v2). Read it first; read the closest package/app-level context next; ADRs in `docs/adrs/` win any disagreement with prose here.

## Context File Synchronization (Required)

This directory has two equivalent AI context files: `CLAUDE.md` and `AGENTS.md`.

When you modify either file, you MUST update the sibling in the same change so they stay synchronized. Downstream packages may add their own local pair; the local pair wins for local implementation details, this root wins for repo-wide conventions.

---

## Why v2 Exists

v1 shipped three categories of user-visible incidents. v2 replaces the **architectural decisions** that produced them — not the individual bugs:

| Dor reportada | Root cause in v1 | v2 structural fix |
|---|---|---|
| Perda do runtime Claude SDK (Windows) | Binários externos (`node`, `pnpm`, `uv`, `python3`, `git`) resolvidos via `PATH` do usuário | Runtimes **empacotados** com checksums SHA-256, validados no boot, installer identity autoritativo |
| Travamento por memória (Windows) | Main process monolítico (1461 LOC / 151 arquivos), sem isolamento por sessão, `chokidar` vazando handles | Main thin (<3000 LOC), worker-per-session via `utilityProcess`, supervisor com health checks, `@parcel/watcher` |
| Perda de credenciais | 93 arquivos tocando `credentials.enc`, escrita sem lock, AES custom com chave derivada de valor estático | `CredentialVault` como gateway único, Electron `safeStorage` (Keychain/DPAPI/libsecret), escrita atômica `write→fsync→rename` com `credentials.backup.enc` |

v2 não é uma reescrita cosmética. É a substituição de três decisões estruturais da v1 por padrões já validados em Electron de produção (VS Code, Slack, Discord, 1Password).

Roadmap completo e rastreável: `STUDY/Audit/Tasks/` (no repositório irmão `G4OS/`, lido mas **não editado** pela v2). Fases 00-15, cada task com critério de aceite objetivo.

---

## Princípios Não-Negociáveis

1. **Forcing functions > prosa.** Regra que não é gate de CI não é regra — é sugestão, e sugestão erode.
2. **Gates bloqueiam PRs do tech lead inclusive.** Se o gate é contornável por seniority, ele não existe.
3. **Arquitetura antes de feature.** Boundaries (kernel → platform → features → apps) são enforcadas antes de qualquer domínio ser escrito.
4. **Humano + IA por design.** Arquivos ≤500 LOC, tipos > comentários, ADRs como contexto permanente. Código que uma LLM consegue entender sem alucinar.
5. **Vibe coding é permitido, vibe gates não existem.** Origem do código é irrelevante; gates aplicam-se igualmente.

---

## Repository Snapshot

- **Nome:** `@g4os/monorepo`
- **Node:** 24 LTS (`.nvmrc=24`, `engines.node=>=24.0.0`, auto-fetch via `.npmrc use-node-version=24.10.0`) — piso imposto para `node:sqlite` estável (ADR-0040a)
- **Electron (quando instalado):** `≥ 38` (piso permanente v2) para garantir Node 24 bundled
- **Package manager:** `pnpm@10.33.0` (hoisting determinístico)
- **Task runner:** Turborepo (cache + paralelismo)
- **Linter/Formatter:** Biome 2.4.12 (substitui ESLint+Prettier)
- **TypeScript:** 6.0.3 em strict absoluto (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`)
- **Test runner:** Vitest
- **Git hooks:** lefthook (não husky)
- **Versioning:** Changesets + Conventional Commits via commitlint

### Estrutura atual

```
packages/
├── kernel/        # Tipos, Result, Disposable, logger, schemas (Zod), validation
├── platform/      # OS abstraction — paths (env-paths), keychain, runtime-paths, spawn
├── ipc/           # tRPC v11 + electron-trpc + superjson (router central)
├── credentials/   # `CredentialVault` gateway (mutex + backups 3x + metadata), backends in-memory/file/safeStorage, migrador v1→v2, `RotationOrchestrator` (ADRs 0050–0053)
├── data/          # node:sqlite (Node 24) + Drizzle (beta 1.0 pinado, ADR-0042), migrations com backup pré-migration, `events/` (JSONL append-only + replay + checkpoints multi-consumer, ADR-0043), `attachments/` (content-addressed SHA-256 + refcount + GC, ADR-0044), `backup/` (ZIP v1: export/restore + manifest Zod, ADR-0045)
├── observability/ # pino transports (via @g4os/kernel logger), OTel tracer/propagation + lazy SDK, Sentry scrub/init, memory monitor + leak detector, prom-client metrics registry, debug ZIP export (ADRs 0060–0065)
├── agents/        # `@g4os/agents/interface` — IAgent + AgentFactory + AgentRegistry (Result) + AgentEvent union + schemas Zod (ADR-0070); `@g4os/agents/claude` — ClaudeAgent modular (mapper + prompt-cache + stream-runner + providers lazy direct/bedrock/compat), ADR-0071; `@g4os/agents/codex` — CodexAgent via subprocess NDJSON (AppServerClient + Subprocess DI + binary-resolver + bridge-mcp skeleton), ADR-0072; Pi pendente (TASK-07-04)
├── sources/       # `@g4os/sources/{interface,mcp-stdio,mcp-http,managed,oauth,lifecycle,planner,catalog,store}` — ISource + SourceRegistry + MCP stdio/http + managed connectors base + OAuth kit (PKCE/deep-link/loopback) + SourceLifecycleManager (intent detector, sticky/rejected por sessão) + `planner` (classifica per-turn native_deferred/broker_fallback/filesystem_direct) + `catalog` (15 managed seeds: Gmail, Google Workspace, Outlook, Teams, Slack, GitHub, Linear, Jira, Asana, Pipedrive, Trello) + `store` (JSON atômico por workspace; segredos ficam no vault referenciados por `credentialKey`), ADRs 0081-0086
├── permissions/   # `@g4os/permissions` — PermissionBroker (mediador Deferred queue + allow_session in-memory + persistência via store) + PermissionStore (JSON atômico por workspace, chave `(toolName, argsHash)` SHA-256 de args ordenados). OUTLIER-09 P1/P2
├── session-runtime/ # `@g4os/session-runtime` — composição-agnóstica de turn execution: `runToolLoop` (multi-iteração tool use + permission gate), `runAgentIteration` (Observable→Promise com captura de tool_use_start/complete), `SessionEventBus` (pub/sub in-memory por sessionId + eventos discriminados persistidos vs transientes), `finalizeAssistantMessage`, `turn-ops` (respondPermission/stopTurn/notImplemented helpers), event-log wrappers sobre `@g4os/data/events`. Depende só de kernel/agents/data/ipc/observability/permissions
├── features/      # scaffolding — Feature-Sliced Design por domínio (TASK-11)
└── ui/            # React + Radix + Tailwind compartilhado

apps/
├── desktop/       # Electron main (thin) + renderer
│   └── src/main/  # < 3000 LOC total, ≤ 300 por arquivo (gate `check:main-size`)
└── viewer/        # Web viewer/admin (existente do v1, mantido)

scripts/           # Gates customizados (check-file-lines, check-exports, check-main-size, new-adr)
docs/adrs/         # ADRs imutáveis — 0001-0040 aceitos
.github/workflows/ # CI (ci.yml, release.yml)
```

---

## Architecture: Critical Execution Path

Cada fluxo que importa passa por estas camadas, nesta ordem:

1. **`apps/desktop/src/index.ts`** → delega para `./main/index.ts`
2. **`apps/desktop/src/main/index.ts`** (entry fino, ~60 LOC): `await app.whenReady()` → instancia `AppLifecycle`, `ProcessSupervisor`, `SessionManager`, `CpuPool`, `WindowManager`; registra handlers de shutdown; abre janela; inicia IPC.
3. **`apps/desktop/src/main/process/supervisor.ts`** spawns `utilityProcess` por sessão; `HealthMonitor` faz ping a cada 30s, restart com backoff exponencial (`1s → 2s → 4s`, máx 2 restarts).
4. **`apps/desktop/src/main/workers/session-worker.ts`** roda em processo isolado; recebe `send-message`, `interrupt`, `health-check`, `shutdown` via `parentPort`; sessionId vem em `process.argv[2]` (nunca `process.env`).
5. **`apps/desktop/src/main/ipc-server.ts`** conecta `electron-trpc/main` ao router em `packages/ipc/src/server`.
6. Toda resposta percorre `worker.postMessage()` → main → tRPC subscription → renderer (via TanStack Query).

Graceful shutdown (5s deadline):
1. `before-quit` → `AppLifecycle.shutdown()` chama cada handler registrado
2. `SessionManager.dispose()` → `worker.stop(1000)` em cada sessão
3. `ProcessSupervisor.shutdownAll()` → `{type:'shutdown'}` → `waitForExit` com deadline → `forceKill` nos presos
4. `CpuPool.destroy()` → `piscina.destroy()`
5. `app.exit(0)`

SIGINT/SIGTERM disparam o mesmo fluxo via `app.quit()`.

---

## Stack Decisions (by layer, com razão)

### Aceitas (não contestar sem ADR novo)

| Camada | Escolha | ADR |
|---|---|---|
| Monorepo | pnpm + Turborepo | 0001 |
| TypeScript | strict absoluto, sem `any`, sem `@ts-ignore` | 0002 |
| Lint/Format | Biome (custom overrides em `scripts/**`) | 0003 |
| Git hooks | lefthook + commitlint | 0004 |
| IPC | tRPC v11 + electron-trpc + superjson + Zod | 0020 |
| Event sourcing | JSONL append-only (sessões) + SQLite (índices) | 0010 |
| Erros | `Result<T, E>` via `neverthrow` para esperados; exceptions só para bugs | 0011 |
| Lifecycle | `IDisposable` + `DisposableBase` + `DisposableStore` (VS Code pattern) | 0012 |
| Platform | `@g4os/platform` como ponto único de `process.platform`, `env-paths` | 0013 |
| Process isolation | Electron `utilityProcess` por sessão + `piscina` para CPU-bound | 0030 |
| Main thin | <4500 LOC total, ≤300 por arquivo (gate CI) | 0031 |
| Shutdown | Signal → deadline → SIGKILL; exponential backoff em restart | 0032 |
| SQLite | `node:sqlite` nativo (Node 24 LTS) — zero binding externo, WAL, FK ON, synchronous=NORMAL, mmap 256MB | 0040a |
| Event store | JSONL append-only por sessão + replay + checkpoints multi-consumer `(consumer_name, session_id)` | 0043 |
| Attachments | Content-addressed (SHA-256, 2-char prefix) + refcount + GC; write antes da tx, delete depois do commit | 0044 |
| Backup/restore | ZIP v1 (manifest Zod + `sessions/<id>/events.jsonl` + `attachments/<hash>`); scheduler 7/4/3 (diário/semanal/mensal) | 0045 |
| Logging | `pino` estruturado JSON (único) + `pino-roll` app.log/error.log (rotação diária, 100M, hist 7) + wrapper `createLogger(scope)` em `@g4os/kernel` | 0060 |
| Tracing | OpenTelemetry API runtime + SDK Node lazy-loaded (`@opentelemetry/api`, NOOP sem `otlpEndpoint`); `withSpan`, `injectTraceContext`, propagation W3C | 0061 |
| Crash reporting | `@sentry/electron` (main + renderer + worker/node) com `beforeSend`/`beforeBreadcrumb` central via `scrubSentryEvent` (`scrubObject`/`scrubString`); sem DSN → NOOP | 0062 |
| Memória | `MemoryMonitor` (DisposableBase, `setInterval().unref()`, thresholds RSS + heap growth, `auditProcessListeners`) + `ListenerLeakDetector` (WeakMap + WeakRef + `reportStale`) | 0063 |
| Métricas | `prom-client` com `Registry` novo por `createMetrics()`; catálogo IPC/session/agent/MCP/worker em `metrics/registry.ts`; `startHistogramTimer` via `hrtime.bigint` | 0064 |
| Debug export | `exportDebugInfo` em `@g4os/observability/debug`: ZIP com `system.json`+`config.json`+`logs/*`+`metrics.prom`+`crashes/`+`processes.json`; redação dupla (shape + texto), janela de retenção default 7d, cap `10 MiB`/log | 0065 |
| Agents | `@g4os/agents/interface`: `IAgent extends IDisposable` + `AgentFactory` + `AgentRegistry` (`register` lança em duplicate; `resolve`/`create` retornam `Result<IAgent, AgentError>`); `AgentEvent` união discriminada (started/text_delta/thinking_delta/tool_use_*/usage/done/error); schemas Zod para `AgentConfig`/`AgentCapabilities`/`AgentDoneReason`; `rxjs` como transport de stream; implementações em pacotes separados | 0070 |
| ClaudeAgent | `@g4os/agents/claude`: 9 arquivos (capabilities/mapper/cache-markers/tool-accumulator/event-mapper/stream-runner/claude-agent/factory + 3 providers); `ClaudeProvider` contract (`direct`/`bedrock`/`compat`) com `sdkFactory` injetável e lazy `await import(/* @vite-ignore */ '@anthropic-ai/sdk')`; prompt cache 1h só em direct + modelos capazes; AbortSignal propagado em dispose/interrupt/unsubscribe; redução de 4716 → ~925 LOC | 0071 |
| CodexAgent | `@g4os/agents/codex`: 11 arquivos (protocol/frame/subprocess/node-spawner/client/event-mapper/input-mapper/binary-resolver/bridge-mcp/codex-agent/factory); `Subprocess`/`SubprocessSpawner` contract com default `NodeSubprocessSpawner` (`node:child_process`, zero nova dep runtime); NDJSON framing puro (`LineBuffer`) + decoder que rejeita frames inválidos; binary resolver com DI (`CODEX_DEV_PATH` → `CODEX_PATH` → bundled, cada passo valida `fileExists`); multi-turn isolation via `requestId` filter; dispose kills subprocess + detaches bridge MCP | 0072 |
| Sources / MCP | `@g4os/sources`: 6 subpaths (`interface/mcp-stdio/mcp-http/managed/oauth/lifecycle`); `ISource extends IDisposable` + `SourceRegistry` (Result); MCP stdio com runtime mode policy (auto→protected, Windows/browser-auth→compat); MCP HTTP com `withReconnect` (skip(1) inicial + backoff exponencial, `needs_auth` nunca auto-retriado); `ManagedConnectorBase` + `TokenStore` contract; OAuth kit PKCE S256 + deep-link + loopback + `performOAuth` + `createFetchTokenExchanger`; `SourceLifecycleManager` com intent detector (explicit/mention/skill/soft) + sticky/rejected por sessionId; runtimes externos (MCP client, subprocess, fetcher, callback handler) injetados | 0081-0086 |
| Auth | `@g4os/auth`: 5 subpaths (`types/otp/managed-login/entitlement/refresh`); `SupabaseAuthPort` + `AuthTokenStore` como portas DI (sem dependência em `@supabase/supabase-js` ou `@g4os/credentials`); OTP fix V1 (fallback `email → signup`); `ManagedLoginService extends DisposableBase` com FSM discriminada (`idle → requesting_otp → awaiting_otp → verifying → bootstrapping → authenticated | error`); `EntitlementService` com dev bypass opt-in + `onBypassUsed`; `SessionRefresher` com `setTimer`/`now` injetáveis, buffer 5 min antes do expiry, `reauth_required` em vez de auto-logout | 0091-0094 |

### Credenciais, watchers, testes (implementação próxima)

| Camada | Escolha | Por que |
|---|---|---|
| Credenciais | Electron `safeStorage` (Keychain/DPAPI/libsecret) + gateway único `CredentialVault` + backup rotation (3x) + metadata por chave + migrador v1→v2 não-destrutivo (ADRs 0050–0053) | Nunca grava chave em texto plano; serializa escritas via mutex; corrupção recupera via backup; migração de usuários v1 sem perda |
| File watching | `@parcel/watcher` | `chokidar` tem leak documentado no Windows |
| Subprocess | `execa` + `tree-kill` (filhos morrem limpos) | Substitui `child_process.spawn` cru |
| Concorrência | `p-queue` + `p-retry` + `p-timeout` | Thundering herd controlado, timeouts em toda chamada externa |
| ORM (sobre SQLite) | `drizzle-orm@1.0.0-beta.17-8a36f93` + `drizzle-kit` matching — _beta pinado até 1.0 GA (ADR-0042); só exceção autorizada à política "sem beta"_ | 0042 |
| Server state (renderer) | TanStack Query | GC automática resolve leak do renderer |
| Client state (renderer) | Jotai (manter do v1) | Granular; `atomFamily` nativo (não usar `jotai-family`) |
| Forms | React Hook Form + `@hookform/resolvers` + Zod | Padrão, performance |
| Routing | TanStack Router (type-safe, file-based) | Deep links validados via Zod |
| E2E | `@playwright/test` + `playwright-electron` | Padrão de mercado |
| Memory | `memlab` em CI noturno | Detecta leaks antes de prod |

### Bibliotecas banidas (não entram, nem "vai que precisa")

```
keytar                    # arquivado — usar Electron safeStorage
chokidar                  # memory leak no Windows — @parcel/watcher
electron-log              # 3 estratégias de log no v1 — só pino + @sentry/electron
husky                     # deprecated — lefthook
eslint + plugins          # 10-20x mais lento — Biome
react-simple-code-editor  # abandonado — CodeMirror 6 ou Monaco
@uiw/react-json-view      # alpha perpétuo — react-json-tree
next-themes               # overkill em Electron — Context API
javascript-obfuscator     # teatro de segurança
xlsx (SheetJS community)  # CVEs críticos — exceljs
moment.js                 # deprecated — date-fns / nativo
lodash                    # nativo ES2022+ cobre 90%
axios                     # undici / fetch
node-ipc                  # tRPC resolve
electron-rebuild          # npmRebuild: true do electron-builder resolve
@types/bun: latest        # Bun já traz tipos embutidos
jotai-family              # `atomFamily` é nativo no Jotai v2
strip-markdown            # parte do remark
marked, markdown-it       # padronizar em remark/rehype + react-markdown
```

Pacotes em alpha/RC/beta **não entram em `dependencies`**, salvo exceção com ADR próprio documentando trade-off, pin exato e plano de migração para GA. Única exceção ativa: `drizzle-orm@1.0.0-beta.17-8a36f93` (ADR-0042, rastreado em [`docs/TODO-DRIZZLE-GA.md`](docs/TODO-DRIZZLE-GA.md)). Nova lib beta → novo ADR; não pode piggy-back em exceção existente.

---

## Code Conventions (forcing functions reais)

### TypeScript

- **Zero `any`.** `noExplicitAny: error` no Biome. `unknown` + narrowing é o caminho.
- **Zero `@ts-ignore` / `@ts-nocheck`.** Se algo não tipa, o código está errado, não o TS.
- `noUncheckedIndexedAccess` ligado — `arr[0]` é `T | undefined`, trate.
- `exactOptionalPropertyTypes` ligado — `{ x?: T }` não aceita `{ x: undefined }`.
- `verbatimModuleSyntax` ligado — use `import type` quando o símbolo é só tipo.
- Sem `default export` em código de aplicação (`noDefaultExport: error`). Default é permitido só em configs (`*.config.ts`, `tsup.config.ts`).

### Limites e organização

- **Max 500 LOC por arquivo** (gate `check:file-lines`). Exceções via `EXEMPTIONS` com justificativa.
- **Main process total < 6500 LOC** (gate `check:main-size`), arquivos em `apps/desktop/src/main/` ≤ 300 LOC cada. Orçamento elevado de 2000→3000 em 2026-04-21 (Epic 10b-wiring), de 3000→4500 em 2026-04-22 (Epic 11-features/02-workspaces), de 4500→4800 em 2026-04-22 (Epic 11-features/03-projects TASK-11-03-06), e de 4800→6200 em 2026-04-23 (TASK-OUTLIER-07/08/09: multi-provider agents-bootstrap, credentials-service vault+IPC, fundação de tool use + permission broker com helpers em `sessions/`). Em 2026-04-23 (TASK-OUTLIER-11) o gate passou a ignorar `src/main/workers/**` porque esse código roda em processos isolados (`utilityProcess` para `session-worker`/`turn-runner`, Piscina threads para `cpu-pool/tasks`) e tem seu próprio orçamento implícito via output size do rollup. Em 2026-04-24 main caiu de 7987 → ~5976 LOC via extrações: `@g4os/session-runtime`, `@g4os/permissions`, `@g4os/sources/{planner,catalog,store}`, `@g4os/agents/tools/handlers/activate-sources`, `connectionSlugForProvider` no kernel. Em 2026-04-24 (FOLLOWUP-04/08) o teto subiu de 6200→6500 junto de duas novas extrações: `sessions/lifecycle.ts` (delete/archive/restore + applyReducer adapter) e `sessions/retry-truncate.ts` (retry/truncate + planner). `@g4os/data/events` ganhou `truncateProjection` e `MessagesService.append` agora retorna `MessageAppendResult` com `sequenceNumber` real — zero `buildMessageAddedEvent(msg, 0)` placeholder.
- **Zero dependências circulares** (gate `check:circular` via madge).
- **Boundaries enforcadas** (gate `check:cruiser` via dependency-cruiser):
  - `kernel` não depende de nada interno
  - `platform` só depende de `kernel`
  - `ipc` só depende de `kernel`, `platform`, `ipc`
  - `credentials` só depende de `kernel`, `platform`, `credentials`
  - Features **não importam outras features** — comunicam via IPC ou via pacote horizontal (`kernel`, `ui`, `ipc`)
  - Renderer **não importa `electron` nem `main/`** — só via IPC
  - Viewer **não importa `electron`** — é web
  - `@g4os/permissions` só depende de `@g4os/kernel` (cruiser: `permissions-isolated`)
  - `@g4os/session-runtime` depende só de `kernel/agents/data/ipc/observability/permissions` — nunca importa `apps/desktop/src/main/**` diretamente (cruiser: `session-runtime-layering`)

### Padrões obrigatórios

- **IDisposable.** Toda classe que registra listener, timer, WeakRef, watcher, subprocess retorna um disposer. `extends DisposableBase` + `this._register(...)` é o atalho idiomático. Helpers: `toDisposable(fn)`, `combinedDisposable(...)`, `bindToAbort(d, signal)`.

  ```ts
  class Foo extends DisposableBase {
    constructor(emitter: EventEmitter) {
      super();
      this._register(toDisposable(() => emitter.off('x', this.onX)));
    }
  }
  ```

- **Result<T, E>.** Erros esperados são tipos, não exceptions. Zero `try/catch` no caminho feliz.

  ```ts
  async function getCredential(key: string): Promise<Result<string, 'not_found' | 'locked'>>
  // chamador é OBRIGADO a tratar result.isErr() antes de acessar result.value
  ```

- **Event sourcing em sessões.** Sessão = sequência imutável de eventos em JSONL append-only + índice em SQLite. Estado é `fold(events)`. Crash recovery = replay até último evento commitado.

- **Process args, não env.** Worker lê `process.argv[2]` (passado via `utilityProcess.fork(module, [arg], options)`). `process.env` está bloqueado por `noProcessEnv: error` — usa `@g4os/platform` para leitura de vars quando inevitável.

- **Dynamic imports para native deps opcionais** (padrão usado em `electron-runtime.ts`, `cpu-pool.ts`, `managed-process.ts`):
  ```ts
  const specifier = 'piscina';
  const mod = (await import(/* @vite-ignore */ specifier)) as Module;
  ```
  Mantém pacote typechecking/lintando sem a dep instalada (CI sem build step, scaffolding). **Não aplicável a `node:sqlite`** — é stdlib do Node 24, import direto sempre funciona.

- **Path safety em tool handlers.** Escape-de-diretório não pode usar `startsWith('${base}/')` — POSIX-only, quebra em Windows (separador `\`). Padrão correto:
  ```ts
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new AppError(...);
  ```
  Implementação canônica: `packages/agents/src/tools/shared/path-guard.ts` (`resolveInside()`).

- **Shell launcher cross-platform.** Nunca hardcode `/bin/sh -c`. Usar `packages/agents/src/tools/shared/shell-launcher.ts` (`resolveShell()`): retorna `['cmd.exe', '/d', '/s', '/c']` no Windows, `['/bin/sh', '-c']` nos demais.

### Anti-patterns (bloqueados por Biome)

- `console.*` fora de `scripts/**` → `noConsole: error` (v1 tinha 330 ocorrências; usar `createLogger('scope')` do kernel)
- `ipcMain.handle` direto → usar tRPC router, nunca handler solto
- `process.env['X']` → `noProcessEnv: error`
- `require(...)` ou `module.exports` → `noCommonJs: error`
- `{}` vazio (blocos/tipos) → `noEmptyBlockStatements: error`
- `async` sem `await` → `useAwait: error`. **Como cumprir:** se nenhum branch do corpo usa `await`, remova `async` e retorne `Promise.resolve(value)` diretamente. Nunca declare `async function` só para retornar uma promessa já resolvida.
- `as any` → direto proibido por `noExplicitAny`
- ARIA role interativo em elemento semântico não-interativo → `noNoninteractiveElementToInteractiveRole: error`. `ul`, `li`, `p`, `span`, etc. não aceitam `role="listbox"`, `role="option"`, `role="combobox"`, etc. Use `div`.
- ARIA role interativo sem `tabIndex` → `useFocusableInteractive: error`. Todo elemento com role interativo precisa de `tabIndex` (normalmente `-1` para foco gerenciado via `aria-activedescendant`; `0` para inclusão no tab order natural).

### Padrões de UI (ARIA + Acessibilidade)

**Combobox typeahead (pickers, mentions, search):** `role="combobox"` pertence ao `<input>` ou `<textarea>` que recebe o input do usuário — nunca ao wrapper do popover. Estrutura obrigatória:

```tsx
// input/textarea = combobox real (detém foco)
<textarea
  role="combobox"
  aria-expanded={open}
  aria-controls="my-listbox"
  aria-activedescendant={activeOptionId}
/>
// popover = listbox (div, não ul)
<div id="my-listbox" role="listbox" tabIndex={-1}>
  <div role="option" tabIndex={-1} aria-selected={true} id="opt-1">…</div>
</div>
```

**Pre-commit workflow:** sempre rodar `./node_modules/.bin/biome check --write <files>` **antes** de `git add`. O hook lefthook tem `stage_fixed: true`, mas opera sobre o snapshot staged — fazer `git add` antes do fix deixa a versão staged stale e o hook bloqueia mesmo após o auto-fix no working tree. Sequência segura: `biome check --write` → `git add` → `git commit`.

### Arquivos, naming, exports

- Arquivos em `kebab-case.ts`, classes em `PascalCase`, funções em `camelCase`, constantes em `SCREAMING_SNAKE_CASE`.
- Imports ordenados automaticamente por Biome (`assist/source/organizeImports`).
- Barrels (`index.ts`) só re-exportam; nunca contêm lógica.
- `package.json` de cada pacote declara `exports` explicitamente; attw (`@arethetypeswrong/cli`) valida.

---

## Testing Strategy

| Tipo | Onde | Alvo |
|---|---|---|
| Unit | `packages/kernel`, `packages/data`, lógica pura | ≥90% |
| Contract | IPC procedures (input/output fixados via Zod) | 100% das procedures |
| Integration | Session + Agent + MCP juntos com mocks | Flows críticos |
| E2E | Playwright + Electron (login, chat, MCP auth, multi-window) | Smoke por release |
| Memory | Heapdump antes/depois de N ciclos, heap growth < 5% | Loop de 1h sem leak |
| Platform | CI matrix macOS + Windows + Linux | Caminho crítico em todos |

Testes de memória em pipeline noturna (`memlab`) — PR não espera, mas issue automática se quebrar.

Fixtures via `fishery` + `@faker-js/faker`. Mock de HTTP via `msw`. Nunca espalhe fixtures JSON pelo código.

---

## High-Signal Commands

```bash
# install & deps
pnpm install                       # hoisting determinístico; lefthook install roda via prepare; pnpm auto-fetch Node 24 via .npmrc `use-node-version`

# development
pnpm dev                           # turbo run dev --parallel
pnpm --filter @g4os/desktop dev    # apenas desktop

# quality gates (rodam em CI nesta ordem)
pnpm typecheck                     # tsc --noEmit em todo workspace
pnpm lint                          # biome check
pnpm test                          # vitest run
pnpm build                         # tsup em todos os pacotes
pnpm check:file-lines              # gate max-500 LOC
pnpm check:main-size               # gate main <6200 LOC, ≤300/arquivo
pnpm check:circular                # madge — 0 ciclos
pnpm check:cruiser                 # dependency-cruiser — boundaries
pnpm check:dead-code               # knip
pnpm check:unused-deps             # knip --dependencies
pnpm check:exports                 # attw em pacotes públicos
pnpm check:size                    # size-limit (quando preset instalado)

# changesets / ADRs
pnpm changeset                     # criar changeset para PR que toca pacote
pnpm changeset:status              # validar que há changeset vs origin/main
pnpm adr:new                       # scaffolda novo ADR em docs/adrs/NNNN-<slug>.md
```

Se um gate falha, **não passe por cima** — entenda a causa. Contornar com `// biome-ignore` exige comentário `(reason: <cause>)` e code review específico.

---

## Working on a Task

Tasks vêm numeradas e auto-contidas em `STUDY/Audit/Tasks/<epic>/TASK-XX-YY-<slug>.md` (repo vizinho `G4OS/`). Cada task traz:

- **Metadata:** ID, prioridade (P0/P1/P2), esforço (S/M/L/XL), dependências
- **Contexto:** o que no v1 motiva
- **Objetivo** + **passo a passo** (código de exemplo — adaptar ao estilo v2)
- **Critérios de aceite** (checklist verificável)
- **Armadilhas v1** (o que NÃO fazer)
- **Referências**

Workflow sugerido:

1. Ler a task **inteira** antes de codar. Armadilhas do v1 são o melhor sinal.
2. Ler o ADR relacionado (seção "Stack Decisions"). Se não há ADR e a decisão é não-trivial, **crie um** antes do código (`pnpm adr:new`).
3. Implementar seguindo os padrões (IDisposable, Result, tRPC, etc.).
4. Criar changeset se tocou em pacote (`pnpm changeset`).
5. Atualizar ADR/docs **no mesmo PR** se comportamento mudou.

Tasks concluídas até agora: 00-foundation inteiro, 01-kernel inteiro, 02-ipc-layer inteiro, 03-process-architecture inteiro (TASK-03-01 a 03-06), 04-data-layer inteiro (TASK-04-01 SQLite, 04-02 Drizzle, 04-03 migrations, 04-04 event-sourced sessions, 04-05 attachments, 04-06 backup/restore), 05-credentials inteiro (TASK-05-01 vault, 05-02 safeStorage/backends/factory, 05-03 migração v1→v2, 05-04 rotation — ADRs 0050–0053), 06-observability inteiro (TASK-06-01 pino, 06-02 OTel, 06-03 Sentry, 06-04 memory monitor + leak detector, 06-05 Prometheus metrics, 06-06 debug export — ADRs 0060–0065), 07-agent-framework inteiro (TASK-07-01 IAgent + AgentRegistry — ADR-0070; TASK-07-02 ClaudeAgent — ADR-0071; TASK-07-03 CodexAgent — ADR-0072; TASK-07-04 broker shared — ADR-0073), 08-sources-mcp inteiro (TASK-08-01 a 08-06 — ADRs 0081-0086: ISource + registry, MCP stdio/http, managed connectors base, OAuth kit, SourceLifecycleManager), 09-auth inteiro (TASK-09-01 OTP fix, 09-02 ManagedLoginService FSM, 09-03 EntitlementService + dev bypass, 09-04 SessionRefresher — ADRs 0091-0094), 10-ui-shell + 10a-ajustes. **Epic 10b-wiring** concluído: `@g4os/auth` subpath `./supabase`; main usa `ManagedLoginService`+`SessionRefresher` reais; `@g4os/observability` inicializado no boot; renderer `AuthStateStore` com `beforeLoad` síncronos. **Epic 11-features/01-sessions** concluído (TASK-11-01-01 a 01-04): session list + filtros + lifecycle dialog + labels + branching + global search — ADRs 0126-0129. **Epic 11-features/02-workspaces** concluído (TASK-11-02-01 a 02-04): workspace list/create/edit/delete + transfer export/import + platform service + windows service — ADRs 0120-0125. **Epic 11-features/03-projects P0** concluído (TASK-11-03-01 a 03-04): schema SQLite `projects`+`project_tasks`, `ProjectsRepository`+`ProjectTasksRepository`, `ProjectsService` com 17 métodos (CRUD + files + tasks + sessions), `file-ops.ts` (path-guard + snapshots + 10 MiB limit), 5 componentes React em `@g4os/features/projects` (card/list/dialog/files-panel/task-board), 24 translation keys pt-BR+en-US — ADRs 0130-0132. **TASK-11-03-06 (legacy import)** concluído: `legacy-import.ts` com discovery nos 3 locais candidatos + sentinel file, `LegacyProjectsReview` component, 3 tRPC procedures (`hasLegacyImportDone`/`discoverLegacyProjects`/`importLegacyProjects`), 13 translation keys, `registerLegacy` no repository — ADR-0133. Pendente: TASK-11-03-05 (collab Yjs — P1/XL, deferido), renderer hooks para projetos na app desktop.

**OUTLIER backlog (tasks suplementares fora da grade 00-11) concluídas** — 01-session-chat-page, 02-projects-routes, 03-workspace-landing, 05-agent-runtime-wiring, 07-multi-provider-agents, 08-credential-vault-integration, 11-session-worker, 15-news-hub, 17-composer-model-selector, 19-composer-workingdir-picker, 22-chat-observability. **OUTLIER-09 Phase 1 (tool use + permissions)**: `TurnStreamEventSchema` estendido com `turn.permission_required` + `turn.tool_use_started` + `turn.tool_use_completed`; `PermissionBroker` (`apps/desktop/src/main/services/permission-broker.ts`) com Deferred queue + `request/respond/cancel`; IPC `sessions.respondPermission`; `runAgentIteration` helper (`sessions/turn-runner.ts`) converte Observable→Promise com captura de `tool_use_start`/`tool_use_complete`; `runToolLoop` (`sessions/tool-loop.ts`) multi-iteração — em `doneReason === 'tool_use'` consulta broker, executa handler do `ToolCatalog`, persiste assistant (text+tool_use) + message role=tool, re-roda agent; `TurnDispatcher` refatorado pra delegar ao loop e injetar `AgentConfig.tools`; tools expostas: `list_dir` + `read_file`; renderer `handleTurnEvent` switch + `handlePermissionRequired` com `requestPermission` modal + `mapPermissionDecision`. **Outras correções recentes**: `<Toaster />` montado em `__root.tsx` (sonner silenciava antes); `useStreamingText` 60fps drain via `requestAnimationFrame` em `packages/features/src/chat/hooks/use-streaming-text.ts`; `wrapError` em `stream-runner.ts` mapeia 401/403→`Invalid API key` e 429→rate limited ao invés de genérico "Network error"; `@anthropic-ai/sdk@0.91.0` instalado como dep de `apps/desktop`; `ManagedLoginService.restore()` rehidrata sessão persistida do vault na inicialização + `AUTH_SESSION_META_KEY` para userId/email/expiresAt; `SubSidebarShell` children wrapper virou `flex flex-col` para corrigir scroll das subsidebars. **Form standard**: `WorkspaceCategory` + `TagsCategory` + `CreateProjectDialog` migrados para react-hook-form + `zodResolver` + `InputField` de `@g4os/ui/form` (em paridade com auth steps). **OUTLIER-04 (sources UI) desparkada + OUTLIER-10 Phase 1 (source mounting MVP)**: kernel `source.schema.ts` expõe `SourceConfigView`/`SourceCatalogItem`/inputs Zod; `SourcesService` IPC expandido (9 procedures: list/listAvailable/get/enableManaged/createStdio/createHttp/setEnabled/delete/testConnection); `SourcesStore` JSON atômico por workspace (`workspaces/{id}/sources.json`), segredos nunca no payload — só `credentialKey` referenciando o vault; `managed-catalog.ts` com 15 seeds (Gmail, Google Calendar/Drive/Docs/Sheets, Outlook email/calendar, Teams, Slack, GitHub, Linear, Jira, Asana, Pipedrive, Trello); main `SourcesService` real wire; `@g4os/features/sources` com `SourcesPage`/`SourceCard`/`CatalogItemCard`/`CreateStdioDialog` (react-hook-form + zod); rota `/connections` renderiza a SourcesPage real (não mais placeholder); 40+ translation keys. Schema SQLite `sessions` ganhou `enabled_source_slugs_json`/`sticky_source_slugs_json`/`rejected_source_slugs_json` (migration `20260424000000_sessions_source_slugs`, repository update/rowToSession atualizados). `source-planner.ts` classifica sources em `native_deferred`/`broker_fallback`/`filesystem_direct` por turn; `TurnDispatcher` injeta plan summary como system prompt contextual para o agent saber o que está disponível; `activate-sources-tool.ts` é tool handler que marca sticky no session — stickys persistem entre reabertura de sessão. Managed connectors reais (mount OAuth + invocação tools) ficam como follow-up OUTLIER-12. **OUTLIER-18 (composer source picker)**: `SourcePicker` em `@g4os/features/chat` — Popover com grupos por kind (managed / mcp-http / mcp-stdio / api / filesystem), checkbox per source, status badges, empty state com CTA `/connections`. Composer ganhou slot `sourcePicker` (parity com `workingDirPicker`). Session page wire com `trpc.sessions.update` patchando `enabledSourceSlugs`. Chip mostra count. **OUTLIER-16 (settings hub 12/12)**: últimas 3 categorias entregues — `UsageCategory` placeholder honesto com stats vazios + badge `Em breve` até billing backend existir, `PermissionsCategory` com 2 painéis (tools placeholder + sources per-session list com sticky/rejected + botão `Clear` que zera via `sessions.update`), `CloudSyncCategory` descritivo do escopo (o que sincroniza vs não) + badges `Em breve`. Todas com 40+ translation keys pt-BR/en-US. `settings.$category.tsx` switch cobre os 12 casos. **OUTLIER-20 Phase 1 MVP (composer mentions)**: `useMentionTypeahead` hook detecta `@` em start/whitespace + query substring até cursor; `MentionPicker` popover renderizado acima do textarea quando `mentionSources` está presente; seleção insere marker plain-text `[source:slug]` (backend já parseia). ComposerTextarea ganhou `onCaptureKeyDown` + `getElement()` na imperative handle pra suportar nav teclado (Arrow/Enter/Esc) sem submeter. Phase 2 (chip-based editor, `@file`/`@skill`/`#label`, content blocks estruturados) fica como follow-up — depende de decisão UX entre contenteditable custom vs Lexical/TipTap. **OUTLIER-09 Phase 2 (tool permissions persistence)**: `PermissionStore` JSON atômico por workspace (`workspaces/{id}/permissions.json`) com match por `(toolName, argsHash)` — `hashArgs` é SHA-256 de args JSON ordenados, então mesma tool com input diferente pede permissão de novo; `PermissionBroker` consulta store + cache in-memory `allow_session` antes de emitir `turn.permission_required`, e persiste no store quando usuário escolhe `allow_always`; `PermissionsService` IPC com `list`/`revoke`/`clearAll` e schema compartilhado `ToolPermissionDecisionSchema` em `@g4os/kernel/schemas`; `PermissionsCategory` no settings ganha seção "Tool decisions" listando cada `(toolName, argsHash)` com preview dos args e botão `Revoke`. **OUTLIER-23 MVP (E2E smoke)**: novo pacote `apps/desktop-e2e/` com Playwright + Electron launcher — `launchApp()` helper cria `userDataDir` tmpdir por teste (evita state bleed), 2 smoke tests (`app launches` + `shell sidebar visible`), `playwright.config.ts` retain-on-failure para videos/screenshots. Phase 2 authenticated flows (login/session/send/modal/E2E parity completa) documentada no README como follow-up — exige mock Supabase + API keys em CI.

---

## Where to Start by Task

- **Processo/worker issues:** `apps/desktop/src/main/process/*`, `apps/desktop/src/main/services/session-manager.ts`, `apps/desktop/src/main/workers/*`
- **IPC contract:** `packages/ipc/src/server/routers/*` — cada domínio em um arquivo ≤300 LOC
- **Event store / índices:** `packages/data/src/sqlite/database.ts` (wrapper) + `packages/data/src/events/*` (store JSONL, replay, checkpoints) + `packages/data/src/schema/*` (projection sessions/messages/FTS5)
- **Attachments:** `packages/data/src/attachments/storage.ts` (content-addressed) + `gateway.ts` (refcount + GC via transação sync)
- **Backup/restore:** `packages/data/src/backup/{export,import,manifest}.ts` (ZIP v1 + Zod) + `apps/desktop/src/main/services/backup-scheduler.ts` (retenção 7/4/3)
- **Migrations:** `packages/data/drizzle/` + `packages/data/src/migrations/` + `apps/desktop/src/main/services/db-service.ts` + `pnpm db:migrate:status`
- **Credenciais:** `packages/credentials/src/vault.ts` (CredentialVault + mutex + backups) + `backends/*` (in-memory, file+codec, safeStorage via dynamic import) + `factory.ts` (`createVault({ mode })`) + `migration/*` (v1→v2 AES-256-GCM reader + dry-run/idempotente/não-destrutivo) + `rotation/*` (`RotationHandler`, `OAuthRotationHandler`, `RotationOrchestrator` DisposableBase). tRPC `credentials` expõe `get/set/delete/list/rotate`. ADRs 0050–0053.
- **Observability:** `packages/kernel/src/logger/*` (pino wrapper + `createLogger(scope)` + `createProductionTransport`/`createProductionLogger`, ADR-0060) + `packages/observability/src/tracer.ts` + `propagation.ts` (OTel API + `withSpan`, ADR-0061) + `src/sdk/init.ts` (`initTelemetry` lazy) + `src/sentry/{init,scrub}.ts` (`initSentry` lazy + `scrubSentryEvent`/`scrubObject`/`scrubString`, ADR-0062) + `src/memory/{memory-monitor,leak-detector}.ts` (DisposableBase + WeakMap/WeakRef, ADR-0063) + `src/metrics/{registry,timers}.ts` (`createMetrics`/`getMetrics`/`startHistogramTimer`, ADR-0064) + `src/debug/{export,redact}.ts` (`exportDebugInfo` ZIP sanitizado, ADR-0065). Subpath exports: `@g4os/observability/{sdk,sentry,memory,metrics,debug}`.
- **Agents (contract):** `packages/agents/src/interface/{agent,registry,schemas}.ts` — `IAgent extends IDisposable`, `AgentFactory`, `AgentRegistry` (`register` lança em duplicate; `resolve`/`create` → `Result<IAgent, AgentError>`), `AgentEvent` union discriminada, schemas Zod para `AgentConfig`/`AgentCapabilities`/`AgentDoneReason`. Tests em `src/__tests__/{registry,events}.test.ts`. Subpath: `@g4os/agents/interface`. Boundary: `agents-interface-isolated` (depends só em `@g4os/kernel`). ADR-0070.
- **ClaudeAgent:** `packages/agents/src/claude/{capabilities,claude-agent,factory,types}.ts` + `config/mapper.ts` + `prompt-cache/cache-markers.ts` + `runner/{tool-accumulator,event-mapper,stream-runner}.ts` + `providers/{direct,bedrock,compat}.ts`. `ClaudeAgent extends DisposableBase implements IAgent` com `AbortController` por sessão. `createClaudeFactory({ resolveProvider })` suporta slugs `anthropic*` / `claude*` / `bedrock-claude*` / `claude-compat*`. Providers lazy-load SDK real via `sdkFactory` injetável ou `await import` dynamic. Tests em `src/__tests__/claude/*.test.ts` (45 testes). Subpath: `@g4os/agents/claude`. ADR-0071.
- **Sources/MCP:** `packages/sources/src/interface/{source,registry}.ts` — `ISource extends IDisposable` + `SourceRegistry` (Result). `mcp-stdio/{source,runtime-mode,factory}.ts` (auto→protected, Windows/browser-auth→compat). `mcp-http/{source,reconnect}.ts` (skip(1) inicial + backoff exponencial; `needs_auth` nunca auto-retriado). `managed/base.ts` — `ManagedConnectorBase` + `TokenStore`. `oauth/{pkce,callback-handler,loopback,flow,types}.ts` — PKCE S256 + deep-link + loopback HTTP + `performOAuth` + `createFetchTokenExchanger`. `lifecycle/{intent-detector,lifecycle-manager}.ts` — explicit/mention/skill/soft + sticky/rejected por sessionId. Subpaths: `@g4os/sources/{interface,mcp-stdio,mcp-http,managed,oauth,lifecycle}`. 36 testes passando. ADRs 0081-0086.
- **CodexAgent:** `packages/agents/src/codex/{codex-agent,factory,binary-resolver}.ts` + `app-server/{protocol,frame,subprocess,node-spawner,client,event-mapper,input-mapper}.ts` + `bridge-mcp/connect.ts`. `CodexAgent extends DisposableBase implements IAgent` spawna Codex CLI via `SubprocessSpawner` injetável (default `NodeSubprocessSpawner` usa `node:child_process`). `AppServerClient` faz framing NDJSON (`jsonLineEncoder`/`jsonLineDecoder` + `LineBuffer`) com decoder gate anti-regressão. `resolveCodexBinary` ordena `CODEX_DEV_PATH` → `CODEX_PATH` → `bundledBinary` com `fileExists` check por passo. `BridgeMcpConnector` é skeleton attach/current/detach (transport real em TASK-08). Tests em `src/__tests__/codex/*.test.ts` (36 testes). Subpath: `@g4os/agents/codex`. Biome override `noProcessEnv: off` em `**/codex/binary-resolver.ts`. ADR-0072.
- **Agents shared broker:** `packages/agents/src/shared/broker/{mcp-pool,session-tools,permission-handler,source-activation}.ts` + `thinking/level-resolver.ts`. `McpPoolClient` interface (listTools/callTool/closeAll); `filterSessionTools` + `shouldExposeSessionTool` (prompt mode check central — gemini_native não recebe session tools); `PermissionHandler` interface + `AlwaysAllow/AlwaysDeny/AskHandler`; `detectSourceAccessIssue` + `detectBrokeredSourceActivation`; `resolveThinkingConfig` mapeia ThinkingLevel → `reasoning_effort` (OpenAI) / `thinkingBudget` (Google) / `budgetTokens` (Anthropic). Subpath: `@g4os/agents/shared`. ADR-0073.
- **Auth:** `packages/auth/src/otp/otp-flow.ts` (`sendOtp` + `verifyOtp` com fallback `email → signup`); `managed-login/service.ts` (`ManagedLoginService extends DisposableBase`, BehaviorSubject FSM); `entitlement/service.ts` (`EntitlementService`, dev bypass + `onBypassUsed`); `refresh/refresher.ts` (`SessionRefresher`, injected `setTimer`/`now`, `reauth_required`). Subpaths: `@g4os/auth/{types,otp,managed-login,entitlement,refresh}`. Boundary: `auth-isolated`. ADRs 0091-0094.
- **Projects (domínio):** `packages/data/src/projects/{repository,tasks-repository}.ts` (SQLite CRUD) + `apps/desktop/src/main/services/projects-service.ts` (orquestrador 17 métodos) + `apps/desktop/src/main/services/projects/file-ops.ts` (path-guard + snapshots + 10 MiB) + `packages/ipc/src/server/routers/projects-router.ts` (tRPC procedures) + `packages/features/src/projects/` (componentes React: card/list/dialog/files-panel/task-board). `ProjectFile` tipado em `packages/kernel/src/types/project.ts`. Translation keys prefixadas com `project.*` em `packages/translate/src/locales/`. ADRs 0130-0132.
- **Platform/paths:** `packages/platform/src/paths.ts` (único lugar que importa `env-paths`)
- **Kernel helpers:** `packages/kernel/src/{disposable,logger,errors,schemas,validation}/`
- **Main entry:** `apps/desktop/src/main/index.ts` + `app-lifecycle.ts` + `window-manager.ts`

---

## Executing Actions with Care

Destrutivo ou cross-repo exige confirmação:

- `git reset --hard`, `git push --force`, `git clean -f`, `rm -rf` → pergunte
- `pnpm install` em workspace remoto → pergunte
- Edição de `CODEOWNERS`, `.github/workflows/*.yml` → pergunte (afeta merge de todos)
- Alterar ADR aceito → proibido. ADRs são imutáveis; decisão nova = novo ADR superseding.
- Alterar `tsconfig.base.json` / `biome.json` / `.dependency-cruiser.cjs` → ADR obrigatório

Mudanças reversíveis locais (editar, rodar, testar) → siga sem perguntar.

---

## Tone & Style

- Respostas curtas e diretas. Markdown quando ajuda; prose quando a resposta é uma linha.
- Código comentado **só quando o WHY não é óbvio**. Nome bom > comentário. Comentário ≠ documentação da task atual.
- Sem emojis a menos que o usuário peça.
- Referências a arquivo usam `[path](path#L42)` (o IDE abre).
- Não narre o processo de pensamento. Diga o que fez, mostre diff quando relevante, pare.

---

## Open Known Items (FOLLOWUPs)

Itens com implementação intencional incompleta — leia o contexto antes de refatorar:

- **FOLLOWUP-OUTLIER-12** — Managed connectors OAuth live mount + real `McpClient` implementation (SDK-backed) com handshake/tool call pelo broker da sessão. MCP stdio probe (`SourcesService.testConnection` → `@g4os/sources/mcp-stdio.probeMcpStdio`) e botão "Test connection" na UI de Sources já estão entregues (2026-04-24).
- **FOLLOWUP-OUTLIER-23** — E2E Phase 2: 8 flows autenticados (login/session/send/modal/tool-permission), exige mock Supabase + API keys em CI. MVP atual cobre 3 smokes: `app launches`, `shell sidebar visible`, `login screen reachable from fresh userDataDir`.

Resolvidos:

- ~~**FOLLOWUP-04**~~ — `MessagesService.append` retorna `MessageAppendResult` com sequence real; `buildMessageAddedEvent` aceita `MessageAppendResult`; `appendLifecycleEvent` + `emitLifecycleEvent` lêem `session.lastEventSequence + 1`. Reducer propaga `lastEventSequence` no SQLite via `applyReducer` callback. (2026-04-24)
- ~~**FOLLOWUP-08**~~ — `SessionsService.retryLastTurn` e `truncateAfter` reais via `SessionEventStore.truncateAfter()` + novo `truncateProjection` em `@g4os/data/events` (reescreve JSONL + limpa `messages_index` + reposiciona checkpoint). `retryLastTurn` trunca até penúltimo user msg e redispara. (2026-04-24)
- ~~**FOLLOWUP-14**~~ — Testes unitários adicionados: 19 em `@g4os/permissions` (broker + store), 22 em `@g4os/session-runtime` (bus + turn-events + event-log + mutations), 14 em `@g4os/sources/planner` e 9 em `@g4os/agents/tools/handlers/activate-sources`. Event-log helpers agora aceitam `eventStore` injetável pra testabilidade. (2026-04-24)

---

## Context File Maintenance

- Quando comportamento muda, atualizar **este arquivo e `AGENTS.md`** no mesmo commit.
- ADRs aceitos são fonte de verdade; resolver conflito lendo `docs/adrs/NNNN-*.md`.
- Lista de tasks concluídas fica fora deste arquivo (rot muito rápido) — consultar `git log` e `docs/adrs/README.md`.
- MEMORY.md (se existir em `.claude/` do usuário) é contexto pessoal do operador, não do repo.
