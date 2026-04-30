<p align="center">
  <img src="docs/images/icon.png" alt="G4 OS" width="128" height="128" />
</p>

<h1 align="center">G4 OS — v2</h1>

<p align="center">
  Seu Sistema Operacional de IA — um app desktop que aproveita os LLMs<br/>
  state-of-the-art para conectar tudo, gerenciar tudo e rodar seu negócio em um só lugar.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Proprietary-red" alt="Licença" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-24%20LTS-339933" alt="Node" /></a>
  <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-10.33+-f69220" alt="pnpm" /></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/platform-Electron%2041+-47848f" alt="Electron" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-6.0%20strict-3178c6" alt="TypeScript" /></a>
  <a href="https://biomejs.dev/"><img src="https://img.shields.io/badge/lint-Biome%202.4-60a5fa" alt="Biome" /></a>
</p>

---

## Por que existe a v2

A v1 entregou três categorias de incidentes visíveis para o usuário. A v2 substitui as **decisões arquiteturais** que produziram esses incidentes — não os bugs individuais:

| Dor reportada (v1)              | Causa raiz (v1)                                                                                       | Correção estrutural na v2                                                                                                                         |
|---------------------------------|-------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| Perda do runtime Claude (Win)   | Binários externos (`node`, `pnpm`, `uv`, `python3`, `git`) resolvidos via `PATH` do usuário           | Runtimes **empacotados** com checksums SHA-256, validados no boot, identidade do installer autoritativa                                           |
| Travamento por memória (Win)    | Main process monolítico (1461 LOC / 151 arquivos), sem isolamento por sessão, `chokidar` vazando handles | Main thin (<3000 LOC), worker-per-session via `utilityProcess`, supervisor com health checks, `@parcel/watcher`                                 |
| Perda de credenciais            | 93 arquivos tocando `credentials.enc`, escrita sem lock, AES custom com chave derivada de valor estático | `CredentialVault` como gateway único, Electron `safeStorage` (Keychain/DPAPI/libsecret), escrita atômica `write→fsync→rename` com `credentials.backup.enc` |

A v2 não é uma reescrita cosmética. É a substituição de três decisões estruturais da v1 por padrões já validados em apps Electron de produção (VS Code, Slack, Discord, 1Password).

---

## Destaques

- **Processos isolados por sessão** — cada chat roda em `utilityProcess` próprio, supervisionado com health check + backoff exponencial. Sessão travou? Kill do worker, app continua.
- **Gateway único de credenciais** — `CredentialVault` serializa escritas via mutex, mantém 3 rotações de backup, usa `safeStorage` nativo.
- **Event sourcing determinístico** — sessões como JSONL append-only + índice SQLite (`node:sqlite` Node 24), replay + checkpoints multi-consumer.
- **IPC type-safe ponta a ponta** — tRPC v11 + electron-trpc + superjson + Zod, sem codegen.
- **Gates bloqueiam PRs do tech lead inclusive** — forcing functions em CI (file-lines, main-size, dep-cruiser, circular, boundaries).
- **Observabilidade built-in** — `pino` estruturado, OpenTelemetry lazy, Sentry opt-in, memory monitor + leak detector, `prom-client`, debug ZIP export.

---

## Princípios Não-Negociáveis

1. **Forcing functions > prosa.** Regra que não é gate de CI não é regra — é sugestão, e sugestão erode.
2. **Arquitetura antes de feature.** Boundaries (kernel → platform → features → apps) são enforcadas antes de qualquer domínio ser escrito.
3. **Humano + IA por design.** Arquivos ≤500 LOC, tipos > comentários, ADRs como contexto permanente.
4. **Vibe coding é permitido, vibe gates não existem.** Origem do código é irrelevante; gates aplicam-se igualmente.
5. **Zero `any`, zero `@ts-ignore`, zero `process.env` fora de `@g4os/platform`.** TypeScript em strict absoluto.

---

## Stack

| Camada                   | Escolha                                                                  | ADR         |
|--------------------------|--------------------------------------------------------------------------|-------------|
| Monorepo                 | pnpm 10 + Turborepo                                                      | 0001        |
| Runtime                  | Node 24 LTS (piso permanente para `node:sqlite`) + Electron ≥ 38         | 0040a       |
| Linguagem                | TypeScript 6.0 strict absoluto (`verbatimModuleSyntax` + exact optionals) | 0002        |
| Lint/Formatação          | Biome 2.4 (substitui ESLint+Prettier)                                    | 0003        |
| Git hooks                | lefthook + commitlint                                                    | 0004        |
| IPC                      | tRPC v11 + electron-trpc + superjson + Zod                               | 0020        |
| Erros esperados          | `Result<T, E>` via `neverthrow` — exceptions só para bugs                | 0011        |
| Lifecycle                | `IDisposable` + `DisposableBase` + `DisposableStore` (padrão VS Code)    | 0012        |
| Isolamento de processos  | Electron `utilityProcess` por sessão + `piscina` para CPU-bound          | 0030        |
| Main thin                | <3000 LOC total, ≤300 por arquivo (gate de CI)                           | 0031        |
| SQLite                   | `node:sqlite` nativo (Node 24) — zero binding nativo, WAL + mmap 256MB   | 0040a       |
| Event store              | JSONL append-only por sessão + replay + checkpoints multi-consumer       | 0043        |
| Anexos                   | Content-addressed (SHA-256) + refcount + GC                              | 0044        |
| Backup/restore           | ZIP v1 (manifest Zod) + scheduler 7/4/3                                  | 0045        |
| Credenciais              | `CredentialVault` + `safeStorage` + backups + migrador v1→v2 + rotation  | 0050–0053   |
| Logging                  | `pino` estruturado + `pino-roll` via `createLogger(scope)` no kernel     | 0060        |
| Tracing                  | OpenTelemetry API + SDK Node lazy, propagação W3C                        | 0061        |
| Crash reporting          | `@sentry/electron` (main + renderer + worker/node) com scrub central     | 0062        |
| Métricas                 | `prom-client` com `Registry` por `createMetrics()`                       | 0064        |
| Agents                   | `@g4os/agents/{interface,claude,codex,shared}` com `IAgent extends IDisposable` | 0070–0073 |
| Sources / MCP            | `@g4os/sources/{interface,mcp-stdio,mcp-http,managed,oauth,lifecycle}`   | 0081–0086   |
| Auth                     | `@g4os/auth/{types,otp,managed-login,entitlement,refresh}` via portas DI | 0091–0094   |
| State (renderer server)  | TanStack Query                                                           | —           |
| State (renderer client)  | Jotai (`atomFamily` nativo)                                              | —           |
| Forms                    | React Hook Form + Zod + `@hookform/resolvers`                            | —           |
| Routing                  | TanStack Router (type-safe, file-based)                                  | —           |
| E2E                      | `@playwright/test` + `playwright-electron`                               | —           |

ADRs vivem em [`docs/adrs/`](docs/adrs/) e são **imutáveis** — decisões novas criam um ADR novo que superseda o anterior.

---

## Estrutura do monorepo

```text
g4os-v2/
├── apps/
│   ├── desktop/                # Electron main (thin) + renderer (React)
│   └── viewer/                 # Web viewer/admin
├── packages/
│   ├── kernel/                 # Tipos, Result, Disposable, logger, schemas Zod
│   ├── platform/               # Abstração de OS — paths, keychain, runtime-paths, spawn
│   ├── ipc/                    # tRPC v11 + electron-trpc + superjson (router central)
│   ├── credentials/            # CredentialVault + backends + migrador v1→v2 + rotation
│   ├── data/                   # node:sqlite + Drizzle + event store + attachments + backup
│   ├── observability/          # pino transports, OTel, Sentry, memory monitor, metrics, debug
│   ├── agents/                 # IAgent + AgentRegistry + Claude + Codex + broker compartilhado
│   ├── sources/                # ISource + MCP stdio/http + managed + OAuth + lifecycle
│   ├── auth/                   # OTP + ManagedLoginService + Entitlement + SessionRefresher
│   ├── features/               # Feature-Sliced Design por domínio (em curso — Epic 11)
│   └── ui/                     # React + Radix + Tailwind v4 compartilhado
├── docs/
│   └── adrs/                   # Architecture Decision Records (imutáveis)
├── scripts/                    # Gates customizados (check-file-lines, check-main-size, new-adr)
└── .github/workflows/          # CI (ci.yml, release.yml)
```

Roadmap completo e rastreável: `STUDY/Audit/Tasks/` (no repositório irmão `G4OS/`, lido mas **não editado** pela v2). Fases 00–15, cada task com critério de aceite objetivo.

---

## Início Rápido

### Pré-requisitos

- **Node 24 LTS** (`.nvmrc=24`). O `pnpm` busca automaticamente via `.npmrc use-node-version=24.10.0`.
- **pnpm 10.33+** (hoisting determinístico).
- macOS 12+ / Windows 10+ / Linux (Ubuntu 20.04+).

### Setup local

```bash
git clone <repo> g4os-v2
cd g4os-v2
pnpm install                        # lefthook install via prepare
pnpm dev                            # turbo run dev --parallel
pnpm --filter @g4os/desktop dev     # apenas desktop
```

### Quality gates (rodam em CI nesta ordem)

```bash
pnpm typecheck                      # tsc --noEmit em todo workspace
pnpm lint                           # biome check
pnpm test                           # vitest run
pnpm build                          # tsup em todos os pacotes
pnpm check:file-lines               # gate máx 500 LOC
pnpm check:main-size                # gate main <3000 LOC, ≤300/arquivo
pnpm check:circular                 # madge — 0 ciclos
pnpm check:cruiser                  # dependency-cruiser — boundaries
pnpm check:dead-code                # knip
pnpm check:unused-deps              # knip --dependencies
pnpm check:exports                  # attw em pacotes públicos
```

Se um gate falha, **não passe por cima** — entenda a causa. Contornar com `// biome-ignore` exige comentário `(reason: <causa>)` e code review específico.

### Changesets / ADRs

```bash
pnpm changeset                      # criar changeset para PR que toca pacote
pnpm changeset:status               # validar que há changeset vs origin/main
pnpm adr:new                        # scaffolda novo ADR em docs/adrs/NNNN-<slug>.md
```

---

## Arquitetura: Caminho Crítico de Execução

Cada fluxo que importa passa por estas camadas, nesta ordem:

1. **`apps/desktop/src/index.ts`** → delega para `./main/index.ts`.
2. **`apps/desktop/src/main/index.ts`** (entry fino, ~60 LOC): `await app.whenReady()` → instancia `AppLifecycle`, `ProcessSupervisor`, `SessionManager`, `CpuPool`, `WindowManager`; registra handlers de shutdown; abre janela; inicia IPC.
3. **`apps/desktop/src/main/process/supervisor.ts`** spawna `utilityProcess` por sessão; `HealthMonitor` faz ping a cada 30s, restart com backoff exponencial (1s → 2s → 4s, máx 2 restarts).
4. **`apps/desktop/src/main/workers/session-worker.ts`** roda em processo isolado; recebe `send-message`, `interrupt`, `health-check`, `shutdown` via `parentPort`; `sessionId` vem em `process.argv[2]` (nunca `process.env`).
5. **`apps/desktop/src/main/ipc-server.ts`** conecta `electron-trpc/main` ao router em `packages/ipc/src/server`.
6. Toda resposta percorre `worker.postMessage()` → main → tRPC subscription → renderer (via TanStack Query).

**Graceful shutdown (deadline de 5s):**
1. `before-quit` → `AppLifecycle.shutdown()` chama cada handler registrado
2. `SessionManager.dispose()` → `worker.stop(1000)` em cada sessão
3. `ProcessSupervisor.shutdownAll()` → `{type:'shutdown'}` → `waitForExit` com deadline → `forceKill` nos presos
4. `CpuPool.destroy()` → `piscina.destroy()`
5. `app.exit(0)`

SIGINT/SIGTERM disparam o mesmo fluxo via `app.quit()`.

---

## Padrões obrigatórios

- **IDisposable.** Toda classe que registra listener, timer, WeakRef, watcher, subprocess retorna um disposer. `extends DisposableBase` + `this._register(...)` é o atalho idiomático.
- **Result<T, E>.** Erros esperados são tipos, não exceptions. Zero `try/catch` no caminho feliz.
- **Event sourcing em sessões.** Sessão = sequência imutável de eventos em JSONL append-only + índice em SQLite. Estado é `fold(events)`. Crash recovery = replay até o último evento commitado.
- **Args de processo, não env.** Worker lê `process.argv[2]`; `process.env` bloqueado por `noProcessEnv: error`. Use `@g4os/platform` para vars inevitáveis.
- **Imports dinâmicos para deps nativas opcionais** (padrão em `electron-runtime.ts`, `cpu-pool.ts`, `managed-process.ts`).

---

## Anti-patterns bloqueados pela CI

- `console.*` fora de `scripts/**` → `noConsole: error` (a v1 tinha 330 ocorrências; use `createLogger('scope')`)
- `ipcMain.handle` direto → use o tRPC router
- `process.env['X']` → `noProcessEnv: error`
- `require(...)` ou `module.exports` → `noCommonJs: error`
- `as any` → proibido por `noExplicitAny`
- `async` sem `await` → `useAwait: error`
- Dependências circulares → `check:circular` bloqueia
- Feature importando outra feature → `check:cruiser` bloqueia

---

## Bibliotecas banidas (não entram, nem "vai que precisa")

```
keytar                    # arquivado — usar Electron safeStorage
chokidar                  # memory leak no Windows — @parcel/watcher
electron-log              # 3 estratégias de log na v1 — só pino + @sentry/electron
husky                     # deprecated — lefthook
eslint + plugins          # 10–20x mais lento — Biome
moment.js                 # deprecated — date-fns / nativo
lodash                    # nativo ES2022+ cobre 90%
axios                     # undici / fetch
node-ipc                  # tRPC resolve
xlsx (SheetJS community)  # CVEs críticos — exceljs
```

Pacotes em alpha/RC/beta **não entram em `dependencies`**, salvo exceção com ADR próprio documentando trade-off, pin exato e plano de migração para GA. Única exceção ativa: `drizzle-orm@1.0.0-beta.17-8a36f93` (ADR-0042).

---

## Estratégia de Testes

| Tipo         | Onde                                                 | Alvo                              |
|--------------|------------------------------------------------------|-----------------------------------|
| Unit         | `packages/kernel`, `packages/data`, lógica pura      | ≥90%                              |
| Contract     | Procedures de IPC (input/output fixados via Zod)     | 100% das procedures               |
| Integration  | Session + Agent + MCP juntos com mocks               | Fluxos críticos                   |
| E2E          | Playwright + Electron (login, chat, MCP, multi-win)  | Smoke por release                 |
| Memory       | Heapdump antes/depois de N ciclos, crescimento < 5%  | Loop de 1h sem leak               |
| Platform     | Matrix de CI macOS + Windows + Linux                 | Caminho crítico em todos          |

Testes de memória rodam em pipeline noturna (`memlab`) — PR não espera, mas issue automática se quebrar.

---

## Por Onde Começar (Por Tarefa)

- **Issues de processo / worker:** `apps/desktop/src/main/process/*`, `apps/desktop/src/main/services/session-manager.ts`, `apps/desktop/src/main/workers/*`
- **Contrato de IPC:** `packages/ipc/src/server/routers/*` — cada domínio em um arquivo ≤300 LOC
- **Event store / índices:** `packages/data/src/{sqlite,events,schema}/*`
- **Anexos:** `packages/data/src/attachments/{storage,gateway}.ts`
- **Backup/restore:** `packages/data/src/backup/{export,import,manifest}.ts` + scheduler em `apps/desktop/src/main/services/backup-scheduler.ts`
- **Credenciais:** `packages/credentials/src/{vault,backends,factory,migration,rotation}.ts`. tRPC `credentials.*` expõe `get/set/delete/list/rotate`.
- **Observabilidade:** `packages/kernel/src/logger/*` + `packages/observability/src/{tracer,sdk,sentry,memory,metrics,debug}.ts`. Subpath exports: `@g4os/observability/{sdk,sentry,memory,metrics,debug}`.
- **Agents:** `packages/agents/src/{interface,claude,codex,shared}/*`. Subpaths: `@g4os/agents/{interface,claude,codex,shared}`.
- **Sources/MCP:** `packages/sources/src/{interface,mcp-stdio,mcp-http,managed,oauth,lifecycle}/*`.
- **Auth:** `packages/auth/src/{otp,managed-login,entitlement,refresh}/*`. Subpath: `@g4os/auth/*`. Adapter Supabase em `@g4os/auth/supabase`.
- **Platform/paths:** `packages/platform/src/{paths,keychain,runtime-paths,spawn,platform-info}.ts`.
- **Main entry:** `apps/desktop/src/main/{index,app-lifecycle,window-manager}.ts`.

---

## Trabalhando em uma Task

Tasks vêm numeradas e auto-contidas em `STUDY/Audit/Tasks/<epic>/TASK-XX-YY-<slug>.md` (repo vizinho `G4OS/`). Cada task traz:

- **Metadata:** ID, prioridade (P0/P1/P2), esforço (S/M/L/XL), dependências
- **Contexto:** o que na v1 motiva
- **Objetivo** + **passo a passo** (código de exemplo — adaptar ao estilo v2)
- **Critérios de aceite** (checklist verificável)
- **Armadilhas v1** (o que NÃO fazer)
- **Referências**

Workflow sugerido:

1. Ler a task **inteira** antes de codar. Armadilhas da v1 são o melhor sinal.
2. Ler o ADR relacionado. Se não há ADR e a decisão é não-trivial, **crie um** antes do código (`pnpm adr:new`).
3. Implementar seguindo os padrões (IDisposable, Result, tRPC, etc.).
4. Rodar os gates localmente **antes do commit** (veja Início Rápido).
5. Criar changeset se tocou em pacote (`pnpm changeset`).
6. Commit atômico com Conventional Commits (`feat(data): ...`, `fix(electron): ...`, `chore: ...`).
7. Atualizar ADR/docs **no mesmo PR** se o comportamento mudou.

Tasks concluídas cobrem as Fases 00–09 + 10-ui-shell + 10a-ajustes; **Epic 10b-wiring em andamento**. Fase 11 (features) inicia pelo chat.

---

## Segurança

- **Credenciais** via Electron `safeStorage` (Keychain macOS / DPAPI Windows / libsecret Linux); gateway único, escrita atômica, 3 rotações de backup.
- **Servidores MCP isolados**: runtime protegido por default (`executionMode: auto`); host compatibility mode só quando explícito ou quando proteção não está disponível.
- **Permissões por sessão**: cada sessão tem controles independentes de leitura/escrita/execução via `PermissionHandler`.
- **Sentry scrub central** em `beforeSend`/`beforeBreadcrumb`; sem DSN → NOOP.
- **Debug export redigido** (`exportDebugInfo`): shape + texto sanitizados, janela default 7d, cap 10 MiB/log.
- **Crash reports** via `@sentry/electron` em main + renderer + worker.

---

## Licença

[Proprietária](LICENSE) — G4 Educação LTDA. Todos os direitos reservados.

Confidencial. Cópia, modificação, distribuição ou uso não autorizado de qualquer arquivo ou asset deste repositório, no todo ou em parte, é estritamente proibido.

Contato: legal@g4educacao.com.br
