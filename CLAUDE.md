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
| Travamento por memória (Windows) | Main process monolítico (1461 LOC / 151 arquivos), sem isolamento por sessão, `chokidar` vazando handles | Main thin (<2000 LOC), worker-per-session via `utilityProcess`, supervisor com health checks, `@parcel/watcher` |
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
├── agents/        # `@g4os/agents/interface` — IAgent + AgentFactory + AgentRegistry (Result) + AgentEvent union + schemas Zod (ADR-0070); implementações Claude/Codex/Pi em pacotes irmãos (TASK-07-02..04)
├── sources/       # scaffolding — ISource + MCP stdio/http + managed (TASK-08)
├── features/      # scaffolding — Feature-Sliced Design por domínio (TASK-11)
└── ui/            # React + Radix + Tailwind compartilhado

apps/
├── desktop/       # Electron main (thin) + renderer
│   └── src/main/  # < 2000 LOC total, ≤ 300 por arquivo (gate `check:main-size`)
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
| Main thin | <2000 LOC total, ≤300 por arquivo (gate CI) | 0031 |
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
- **Main process total < 2000 LOC** (gate `check:main-size`), arquivos em `apps/desktop/src/main/` ≤ 300 LOC cada.
- **Zero dependências circulares** (gate `check:circular` via madge).
- **Boundaries enforcadas** (gate `check:cruiser` via dependency-cruiser):
  - `kernel` não depende de nada interno
  - `platform` só depende de `kernel`
  - `ipc` só depende de `kernel`, `platform`, `ipc`
  - `credentials` só depende de `kernel`, `platform`, `credentials`
  - Features **não importam outras features** — comunicam via IPC ou via pacote horizontal (`kernel`, `ui`, `ipc`)
  - Renderer **não importa `electron` nem `main/`** — só via IPC
  - Viewer **não importa `electron`** — é web

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

### Anti-patterns (bloqueados por Biome)

- `console.*` fora de `scripts/**` → `noConsole: error` (v1 tinha 330 ocorrências; usar `createLogger('scope')` do kernel)
- `ipcMain.handle` direto → usar tRPC router, nunca handler solto
- `process.env['X']` → `noProcessEnv: error`
- `require(...)` ou `module.exports` → `noCommonJs: error`
- `{}` vazio (blocos/tipos) → `noEmptyBlockStatements: error`
- `async` sem `await` → `useAwait: error` (evita Promise fantasma)
- `as any` → direto proibido por `noExplicitAny`

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
pnpm check:main-size               # gate main <2000 LOC, ≤300/arquivo
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
4. Rodar os gates localmente **antes do commit**:
   ```
   pnpm typecheck && pnpm lint && pnpm test && pnpm build \
     && pnpm check:file-lines && pnpm check:circular && pnpm check:cruiser \
     && pnpm check:dead-code && pnpm check:unused-deps && pnpm check:exports
   ```
5. Criar changeset se tocou em pacote (`pnpm changeset`).
6. Commit atômico com Conventional Commits (`feat(data): ...`, `fix(electron): ...`, `chore: ...`).
7. Atualizar ADR/docs **no mesmo PR** se comportamento mudou.

Tasks concluídas até agora: 00-foundation inteiro, 01-kernel inteiro, 02-ipc-layer inteiro, 03-process-architecture inteiro (TASK-03-01 a 03-06), 04-data-layer inteiro (TASK-04-01 SQLite, 04-02 Drizzle, 04-03 migrations, 04-04 event-sourced sessions, 04-05 attachments, 04-06 backup/restore), 05-credentials inteiro (TASK-05-01 vault, 05-02 safeStorage/backends/factory, 05-03 migração v1→v2, 05-04 rotation — ADRs 0050–0053), 06-observability inteiro (TASK-06-01 pino, 06-02 OTel, 06-03 Sentry, 06-04 memory monitor + leak detector, 06-05 Prometheus metrics, 06-06 debug export — ADRs 0060–0065), 07-agent-framework em progresso (TASK-07-01 IAgent + AgentRegistry — ADR-0070). Próxima ordem sugerida: TASK-07-02 (Claude plugin), seguido de TASK-07-03 (Codex) e TASK-07-04 (Pi); wiring de logger/telemetry/Sentry/memory/metrics ainda pendente em `apps/desktop/src/main/index.ts`.

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

## Context File Maintenance

- Quando comportamento muda, atualizar **este arquivo e `AGENTS.md`** no mesmo commit.
- ADRs aceitos são fonte de verdade; resolver conflito lendo `docs/adrs/NNNN-*.md`.
- Lista de tasks concluídas fica fora deste arquivo (rot muito rápido) — consultar `git log` e `docs/adrs/README.md`.
- MEMORY.md (se existir em `.claude/` do usuário) é contexto pessoal do operador, não do repo.
