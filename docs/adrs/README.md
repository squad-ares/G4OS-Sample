# Architecture Decision Records (ADRs)

## O que é

ADR é um registro **imutável** de uma decisão arquitetural. Cada arquivo:

- Tem número sequencial
- Explica contexto, opções, decisão, consequências
- Não é editado após aceito (apenas novo ADR pode superseder)

## Quando escrever

Escreva ADR quando:

- Escolhe uma tecnologia significativa (banco, framework, lib core)
- Muda um padrão estrutural (ex: decompõe God File)
- Toma decisão com trade-off não-óbvio
- Decisão vai afetar mais de 1 pessoa / time

**Não escreva ADR para:**
- Decisões locais (nome de variável, estrutura de 1 arquivo)
- Decisões óbvias (usar o tipo Date para datas)
- Workarounds temporários

## Como escrever

1. Copiar `_template.md` para `NNNN-titulo-slug.md`
2. Preencher com contexto real
3. Abrir PR com status "Proposed"
4. Discussão assíncrona na PR
5. Tech Lead + pelo menos 1 stakeholder aprovam
6. Merge com status "Accepted"

## Lista

| # | Titulo | Status | Data | Épico |
|---|---|---|---|---|
| 0001 | Monorepo structure with pnpm and Turborepo | Accepted | 2026-04-16 | 00-foundation |
| 0002 | TypeScript strict mode | Accepted | 2026-04-16 | 00-foundation |
| 0003 | Biome linter over ESLint | Accepted | 2026-04-16 | 00-foundation |
| 0004 | Lefthook + Conventional Commits | Accepted | 2026-04-16 | 00-foundation |
| 0005 | CI pipeline with architectural gates | Accepted | 2026-04-16 | 00-foundation |
| 0006 | Package boundaries with dependency-cruiser | Accepted | 2026-04-16 | 00-foundation |
| 0007 | CODEOWNERS enforcement | Accepted | 2026-04-16 | 00-foundation |
| 0008 | Changesets for versioning | Accepted | 2026-04-16 | 00-foundation |
| 0009 | ADR process | Accepted | 2026-04-16 | 00-foundation |
| 0010 | Event-sourced sessions | Proposed | 2026-04-17 | 01-kernel |
| 0011 | Result pattern with neverthrow | Proposed | 2026-04-17 | 01-kernel |
| 0012 | Disposable pattern for resource management | Proposed | 2026-04-17 | 01-kernel |
| 0013 | Platform abstraction layer | Proposed | 2026-04-17 | 01-kernel |
| 0050 | Credential Vault API (mutex + backups + metadata) | Accepted | 2026-04-18 | 05-credentials |
| 0051 | Credential backends + Electron safeStorage | Accepted | 2026-04-18 | 05-credentials |
| 0052 | Credential migration v1 → v2 (não-destrutiva + idempotente) | Accepted | 2026-04-18 | 05-credentials |
| 0053 | Credential rotation (handlers + orchestrator DisposableBase) | Accepted | 2026-04-18 | 05-credentials |
| 0020 | IPC layer with tRPC v11 + electron-trpc + superjson | Accepted | 2026-04-18 | 02-ipc |
| 0030 | Electron utilityProcess for worker isolation | Accepted | 2026-04-18 | 03-process-architecture |
| 0031 | Main process thin-layer architecture (<2000 LOC) | Accepted | 2026-04-18 | 03-process-architecture |
| 0032 | Graceful shutdown with deadline and backoff | Accepted | 2026-04-18 | 03-process-architecture |
| 0040 | SQLite persistence with better-sqlite3 | Superseded by 0040a | 2026-04-18 | 04-data-layer |
| 0040a | Node.js `node:sqlite` as SQLite driver | Accepted | 2026-04-18 | 04-data-layer |
| 0042 | Drizzle ORM 1.0 beta pinado até GA (desvio controlado) | Accepted with caveat | 2026-04-18 | 04-data-layer |
| 0043 | Formato do event store (JSONL + multi-consumer checkpoints) | Accepted | 2026-04-18 | 04-data-layer |
| 0044 | Attachment storage content-addressed com refcount + GC | Accepted | 2026-04-18 | 04-data-layer |
| 0045 | Backup/restore ZIP v1 + scheduler 7/4/3 | Accepted | 2026-04-18 | 04-data-layer |
| 0060 | pino como logger estruturado único (com transports produção) | Accepted | 2026-04-19 | 06-observability |
| 0061 | OpenTelemetry para tracing distribuído (lazy SDK + propagation W3C) | Accepted | 2026-04-19 | 06-observability |
| 0062 | Sentry para crash reporting (scrub centralizado + lazy init) | Accepted | 2026-04-19 | 06-observability |
| 0063 | Memory monitoring + listener leak detection (WeakMap + WeakRef + Disposable) | Accepted | 2026-04-19 | 06-observability |
| 0064 | Métricas de performance no formato Prometheus (registry isolado) | Accepted | 2026-04-19 | 06-observability |
| 0065 | Debug info export (ZIP sanitizado com redação dupla) | Accepted | 2026-04-19 | 06-observability |
| 0070 | Agent plugin architecture (IAgent interface + registry com Result) | Accepted | 2026-04-19 | 07-agent-framework |
| 0071 | ClaudeAgent — DI providers + pure stream mapping + prompt cache 1h | Accepted | 2026-04-19 | 07-agent-framework |
| 0072 | CodexAgent — subprocess NDJSON + Subprocess DI + bridge MCP skeleton | Accepted | 2026-04-19 | 07-agent-framework |
| 0073 | @g4os/agents/shared — proxy broker + thinking resolver | Accepted | 2026-04-19 | 07-agent-framework |
| 0074 | OpenAIAgent — completions + responses API + prompt cache keys | Accepted | 2026-04-19 | 07-agent-framework |
| 0075 | GoogleAgent — Gemini native routing + safe tool names + GenAI SDK | Accepted | 2026-04-19 | 07-agent-framework |
| 0076 | Streaming com batching de deltas e backpressure policy | Accepted | 2026-04-19 | 07-agent-framework |
| 0077 | Permission system — três modos + remember store + queue não-bloqueante | Accepted | 2026-04-19 | 07-agent-framework |
| 0081 | ISource interface + SourceRegistry pluginável | Accepted | 2026-04-20 | 08-sources-mcp |
| 0082 | McpStdioSource — supervisor + protected/compat runtime mode | Accepted | 2026-04-20 | 08-sources-mcp |
| 0083 | McpHttpSource — SSE transport + backoff exponencial + needs_auth detection | Accepted | 2026-04-20 | 08-sources-mcp |
| 0084 | ManagedConnectorBase — decomposição do God File de 1991 LOC | Accepted | 2026-04-20 | 08-sources-mcp |
| 0085 | OAuth Kit — PKCE S256 + deep-link + loopback server + token exchanger | Accepted | 2026-04-20 | 08-sources-mcp |
| 0086 | SourceLifecycleManager — intent detection + sticky/rejected por sessão | Accepted | 2026-04-20 | 08-sources-mcp |
| 0091 | Supabase OTP flow — fallback email→signup + looksLikeInvalidOtp | Accepted | 2026-04-20 | 09-auth |
| 0092 | ManagedLoginService — FSM discriminado + DisposableBase | Accepted | 2026-04-20 | 09-auth |
| 0093 | EntitlementService — dev bypass opt-in + onBypassUsed callback | Accepted | 2026-04-20 | 09-auth |
| 0094 | SessionRefresher — timer injetável + reauth_required em falha | Accepted | 2026-04-20 | 09-auth |
| 0100 | WindowManager — estado de janela persistido por workspace | Accepted | 2026-04-21 | 10-ui-shell |
| 0101 | TanStack Router — roteamento file-based type-safe no renderer | Accepted | 2026-04-21 | 10-ui-shell |
| 0102 | Theme system — Context API + CSS custom properties, sem next-themes | Accepted | 2026-04-21 | 10-ui-shell |
| 0103 | @g4os/ui — consolidação Radix + shadcn/ui como biblioteca única | Accepted | 2026-04-21 | 10-ui-shell |
| 0104 | PlatformProvider — isolamento do renderer de APIs Electron | Accepted | 2026-04-21 | 10-ui-shell |
| 0105 | App Shell + Auth Guard — layout autenticado e bootstrap do SessionRefresher | Accepted | 2026-04-21 | 10-ui-shell |
| 0106 | Startup preflight + env contract compartilhado para build e runtime | Accepted | 2026-04-21 | 10A-ajustes |
| 0107 | Shell autenticado com matriz canônica de navegação antes das features | Accepted | 2026-04-21 | 10A-ajustes |
| 0108 | Core visual do shell inspirado na V1, mas tokenizado para a V2 | Accepted | 2026-04-21 | 10A-ajustes |
| 0109 | Package de tradução + política de zero strings diretas em UI monitorada | Accepted | 2026-04-21 | 10A-ajustes |
| 0110 | Action registry global + baseline de teclado e acessibilidade para o shell | Accepted | 2026-04-21 | 10A-ajustes |
| 0111 | Chat composer architecture — textarea + DraftStore + submit-mode | Accepted | 2026-04-21 | 11-features |
| 0112 | Transcript rendering com virtualização + ações de sessão | Accepted | 2026-04-21 | 11-features |
| 0113 | Tool renderer plugin registry + fallback com marker de erro | Accepted | 2026-04-21 | 11-features |
| 0114 | Attachment pipeline (drop/paperclip/paste + validação na borda) | Accepted | 2026-04-21 | 11-features |
| 0115 | Markdown rendering stack (remark + rehype-raw + Shiki lazy + custom blocks) | Accepted | 2026-04-21 | 11-features |
| 0116 | Permission modal — fila não-bloqueante + 4 escopos + atalhos A/D | Accepted | 2026-04-21 | 11-features |
| 0117 | Model selector + catalog estático com capabilities tipadas | Accepted | 2026-04-21 | 11-features |
| 0118 | Voice input — features transport-agnostic + TranscriptionService fallback | Accepted | 2026-04-21 | 11-features |
| 0119 | Transcript search — reuso FTS5 + SearchFn injection | Accepted | 2026-04-21 | 11-features |
| 0120 | Legacy transcript parity — snapshot harness via SSR | Accepted | 2026-04-21 | 11-features |
| 0121 | Workspace persistence — híbrido SQLite + filesystem com metadata JSON | Accepted | 2026-04-21 | 11-features |
| 0122 | Active workspace — localStorage via useSyncExternalStore | Accepted | 2026-04-21 | 11-features |
| 0123 | Workspace filesystem cleanup — validação de boundary pelo managedRoot | Accepted | 2026-04-21 | 11-features |
| 0124 | Multi-window workspace — isolamento por URL param | Accepted | 2026-04-21 | 11-features |
| 0125 | Workspace export/import — pipeline ZIP com filtragem de caminhos sensíveis | Accepted | 2026-04-21 | 11-features |
| 0126 | Session lifecycle — status enum + timestamps + soft delete 30d | Accepted | 2026-04-22 | 11-features |
| 0127 | Labels hierárquicos via materialized-path (tree_code) | Accepted | 2026-04-22 | 11-features |
| 0128 | Session branching — copy-prefix (estratégia A) | Accepted | 2026-04-22 | 11-features |
| 0129 | Global search — FTS5 cross-session com fallback LIKE | Accepted | 2026-04-22 | 11-features |
| 0130 | Project CRUD — schema SQLite + rootPath filesystem + bootstrap de diretórios | Accepted | 2026-04-22 | 11-features |
| 0131 | Project files — path-traversal guard + snapshots locais pré-save + limite 10 MiB | Accepted | 2026-04-22 | 11-features |
| 0132 | Project tasks — ordering fracional via string lexicográfica sem dependência externa | Accepted | 2026-04-22 | 11-features |
| 0133 | Legacy project import — discovery em 3 candidatos + sentinel file + keep/import/skip | Accepted | 2026-04-22 | 11-features |
| 0134 | @g4os/permissions package — tool-use PermissionBroker + PermissionStore | Accepted | 2026-04-24 | outlier-09 |
| 0135 | @g4os/session-runtime — composition-agnostic turn execution | Accepted | 2026-04-24 | refactor |
| 0136 | @g4os/sources subpaths — planner/catalog/store (OUTLIER-04 unpark + refactor) | Accepted | 2026-04-24 | outlier-04 |
| 0137 | Source mounting per-turn — SourcePlanner + activate_sources tool handler | Accepted | 2026-04-24 | outlier-10 |
| 0138 | News hub — viewer API + cache + polling + sub-sidebar | Accepted | 2026-04-24 | outlier-15 |
| 0139 | Settings hub — 12-category catalog + route switch + feature package | Accepted | 2026-04-24 | outlier-16 |
| 0140 | Composer slots — SourcePicker + MentionPicker + WorkingDirPicker | Accepted | 2026-04-24 | outlier-18/19/20 |
| 0141 | Chat observability — TurnTelemetry Prometheus + OpenTelemetry spans | Accepted | 2026-04-24 | outlier-22 |
| 0142 | E2E testing — Playwright + Electron smoke harness | Accepted | 2026-04-24 | outlier-23 |
| 0143 | MCP stdio probe distinto do `McpClient` real | Accepted | 2026-04-24 | outlier-12 |
| 0144 | `McpClient` SDK-backed (lazy `@modelcontextprotocol/sdk`) | Accepted | 2026-04-24 | outlier-12 |
| 0145 | No utilityProcess per session — main thin + DisposableBase + MemoryMonitor (supersedes 0030) | Accepted | 2026-04-24 | mvp-clean |
| 0146 | Packaging flags + optional signing per build target | Accepted | 2026-04-25 | release |
| 0150 | Modal vs Page para fluxos de criação | Accepted | 2026-04-26 | code-review-1 |
| 0151 | App.tsx LOC exemption (renderer composition root) | Accepted | 2026-04-27 | refactor |
| 0152 | Sources boundary — agents/platform isolation | Accepted | 2026-04-27 | code-review-12 |
| 0153 | pnpm catalog para versões centralizadas | Accepted | 2026-04-28 | code-review-12 |
| 0154 | Hover pattern CI gate (`hover:bg-foreground/N` legacy block) | Accepted | 2026-04-28 | code-review-12 |
| 0155 | Desabilitar `noExcessiveCognitiveComplexity` no Biome | Accepted | 2026-04-28 | code-review-12 |
| 0156 | Chat canvas chrome — sem SessionHeader, light chips + metadata panel | Accepted | 2026-05-01 | v1-v2-divergence |
| 0157 | Creation wizards renderizados como fullscreen splash overlay | Accepted | 2026-05-01 | v1-v2-divergence |
| 0158 | Single-instance lock + protocol registration | Accepted | 2026-05-01 | code-review-18 |

## Status

- **Proposed:** em discussão
- **Accepted:** vigente, deve ser seguida
- **Deprecated:** não deve mais ser seguida, mas ainda em código legado
- **Superseded by ADR-XXXX:** substituída por ADR mais recente

## Referência Rápida

### ADRs de Foundation (00-foundation)
Definem infraestrutura, tooling, processos:
- **0001:** Monorepo com pnpm + Turborepo
- **0002:** TypeScript strict mode
- **0003:** Biome (linter + formatter)
- **0004:** Lefthook + Conventional Commits
- **0005:** CI com gates arquiteturais
- **0006:** Boundaries entre pacotes
- **0007:** CODEOWNERS
- **0008:** Changesets
- **0009:** Processo ADR

### ADRs de Kernel (01-kernel)
Definem padrões de código e abstrações:
- **0010:** Event sourcing para sessions
- **0011:** Result pattern (neverthrow)
- **0012:** Disposable para limpeza de recursos
- **0013:** Platform abstraction (macOS/Windows/Linux)

### ADRs de IPC (02-ipc)
Definem protocolo de comunicação entre main e renderer:
- **0020:** tRPC v11 + electron-trpc + superjson

### ADRs de Process Architecture (03-process-architecture)
Definem arquitetura de processos, isolamento e lifecycle:
- **0030:** Electron utilityProcess para isolamento de workers
- **0031:** Main thin-layer (<2000 LOC, ≤300 per file)
- **0032:** Graceful shutdown com deadline e exponential backoff

### ADRs de Data Layer (04-data-layer)
Definem persistência, schemas e migrations:
- **0040:** SQLite com better-sqlite3 — _superseded no mesmo dia por 0040a, mantida como registro histórico_
- **0040a:** `node:sqlite` nativo (Node 24 LTS) — zero binding externo, elimina vetor de runtime Windows perdido
- **0042:** Drizzle ORM 1.0 beta pinado até GA — única exceção autorizada à política "sem beta em deps"; rastreada em [`docs/TODO-DRIZZLE-GA.md`](../TODO-DRIZZLE-GA.md)

### ADRs de Agent Framework (07-agent-framework)
Definem contrato entre `SessionManager` e implementações de agente (plugin architecture):
- **0070:** `IAgent` + `AgentRegistry` em `@g4os/agents/interface`; implementações ficam em pacotes irmãos; erros de resolução viram Result
- **0071:** `ClaudeAgent` modular (9 arquivos ≤ 200 LOC, total ~925 LOC vs 4716 em v1); `ClaudeProvider` injetável (direct / bedrock / compat, lazy-import); prompt cache 1h só em direct + modelos capazes; AbortSignal propagado em dispose / interrupt / unsubscribe
- **0072:** `CodexAgent` via subprocess NDJSON; `Subprocess`/`SubprocessSpawner` contract com adapter default `NodeSubprocessSpawner` (`node:child_process`, zero nova dep); framing NDJSON puro; multi-turn isolation por `requestId`; bridge MCP skeleton
- **0073:** `@g4os/agents/shared` — broker layer (McpPoolClient, SessionToolProfile, PermissionHandler, source-activation) + thinking resolver cross-provider; zero dep em Electron
- **0074:** `OpenAIAgent` in-process com SDK `openai` oficial; dois protocolos (completions/responses); prompt cache key por fingerprint; tool search namespacing para gpt-5.4+; OpenAI-compat via baseURL
- **0075:** `GoogleAgent` in-process com `@google/genai` oficial; turn classifier LLM pré-turn para native routing (search/url_context/youtube/custom_tools); Gemini safe tool names `[A-Za-z0-9_.]` max 64; thinking config por geração de modelo
- **0076:** `batchTextDeltas(16ms)` + `dropIfBackpressured(100)` como operadores RxJS compostos; text deltas coalescidos a ~60fps; eventos estruturais jamais descartados; timers limpos em teardown
- **0077:** `DefaultPermissionResolver` com três modos (allow-all/ask/safe); `PermissionQueue` não-bloqueante (enqueue/decide/onRequest/dispose); safe mode allowlist imutável; remember scope (once/session/always)

### ADRs de Observability (06-observability)
Definem logger, tracing, crash reporting, memória, métricas e debug export:
- **0060:** pino estruturado + `pino-roll` produção (único logger)
- **0061:** OpenTelemetry API runtime + SDK Node lazy-loaded
- **0062:** Sentry (main/renderer/node) com `beforeSend` central sanitizador
- **0063:** MemoryMonitor + ListenerLeakDetector (DisposableBase, WeakRef)
- **0064:** `prom-client` com Registry injetável, catálogo em `registry.ts`
- **0065:** Debug ZIP export com redação dupla (shape + texto)

### ADRs de Features/Sessions (11-features/01-sessions)
Definem ciclo de vida de sessões, organização, busca e ramificação:
- **0126:** Session lifecycle — status enum (`active`/`archived`/`deleted`) + timestamps + purge assíncrono 30d via `SessionsCleanupScheduler`
- **0127:** Labels hierárquicos — materialized-path `tree_code` com `LIKE 'prefix%'` no índice B-tree; reparentamento em cascata O(n filhos)
- **0128:** Session branching — copy-prefix: copia eventos `0..branchedAtSeq` para JSONL independente; branch é cidadã de primeira classe (sem JOIN com tronco)
- **0129:** Global search — reutiliza `messages_fts` (FTS5) com JOIN em sessions + fallback LIKE para queries inválidas; `snippet()` com marcadores para highlight no cliente

### ADRs de Features/Projects (11-features/03-projects)
Definem persistência, filesystem e UI de projetos:
- **0130:** Project CRUD — schema SQLite `projects`+`project_tasks`, `rootPath` gravado no banco, bootstrap de `files/`+`context/`+`project.json`, `toSlug` inline sem dep externa
- **0131:** Project files — `safeResolve()` bloqueia path traversal, snapshots `.g4os/snapshots/<rel>/<ts>.bak` mantendo 10 mais recentes, limite 10 MiB em `saveFile`
- **0132:** Project tasks ordering — `order TEXT` com timestamp-ms zero-padded (16 dígitos); sem dep `fractional-indexing` por ora; drag-and-drop deferido para sub-task posterior
- **0133:** Legacy import — discovery nos 3 candidatos (wsRoot/projects, workingDir/projects, workingDir/projetos), deduplicação por path resolvido, filtragem de IDs já registrados no DB, 3 decisões (import/keep/skip), `registerLegacy` com ID explícito, sentinel file `.legacy-import-done` para evitar re-exibição do wizard

### ADRs de Sources + Auth (08-09)
Definem runtime de fontes e autenticação base:
- **0081-0086:** Source interface, supervisors MCP, OAuth kit e lifecycle manager
- **0091-0094:** OTP Supabase, managed login FSM, entitlement service e session refresh

### ADRs de UI Shell (10-ui-shell)
Faixa `0100–0105` — decisões de implementação do épico 10:
- **0100:** WindowManager com estado persistido por workspace (TASK-10-01)
- **0101:** TanStack Router file-based type-safe no renderer (TASK-10-02)
- **0102:** Theme system Context API + CSS vars, sem next-themes (TASK-10-03)
- **0103:** `@g4os/ui` consolidação Radix + shadcn/ui (TASK-10-04)
- **0104:** PlatformProvider — renderer isolado de APIs Electron (TASK-10-05)
- **0105:** App Shell + Auth Guard — layout autenticado + SessionRefresher bootstrap (TASK-10-08)

### ADRs de 10A-ajustes (gate pré-épico 11)
Faixa `0106–0110` — decisões de alinhamento arquitetural antes do épico 11:
- **0106:** Startup preflight + env contract compartilhado (TASK-10A-04)
- **0107:** Matriz de navegação do shell autenticado (TASK-10A-05)
- **0108:** Core visual inspirado na V1 e tokenizado em `@g4os/ui` (TASK-10A-06)
- **0109:** `@g4os/translate` + política de zero strings diretas (TASK-10A-07)
- **0110:** Action registry global + baseline de teclado/acessibilidade (TASK-10A-08)

### ADRs de 11-features / 00-chat (épico do chat)
Faixa `0111–0120` — decisões de produto/UX do chat da v2:
- **0111:** Chat composer — textarea nativa + DraftStore + submit-mode (TASK-11-00-01)
- **0112:** Transcript com virtualização (`@tanstack/react-virtual`) + ações de sessão (TASK-11-00-02 / 11-00-08)
- **0113:** Tool renderer registry + dispatcher + `FallbackRenderer` com marker de erro (TASK-11-00-03)
- **0114:** Attachment pipeline unificado (drop/paperclip/paste + validação) (TASK-11-00-04)
- **0115:** Markdown stack (`react-markdown` + `remark-gfm` + `rehype-raw` + Shiki lazy + `customBlockRegistry`) (TASK-11-00-05)
- **0116:** Permission modal — fila, 4 escopos (`once`/`session`/`forever`/`deny`), atalhos (TASK-11-00-06)
- **0117:** Model selector + catálogo estático com `capabilities` e `thinkingLevels` tipados (TASK-11-00-07)
- **0118:** Voice input — `VoiceButton.transcribe` injetado + `TranscriptionService` OpenAI → managed (TASK-11-00-09)
- **0119:** Transcript search — FTS5 existente + `SearchFn` injetado + virtualizer-aware scroll (TASK-11-00-10)
- **0120:** Legacy transcript parity — snapshot harness SSR sem jsdom (TASK-11-00-11)

### ADRs de 11-features / 02-workspaces (épico de workspaces)
Faixa `0121–0125` — decisões de persistência, estado e portabilidade de workspaces:
- **0121:** Persistência híbrida SQLite + filesystem com coluna `metadata` JSON (zero migration por campo de produto) (TASK-11-02-01/02/03)
- **0122:** Active workspace via `useSyncExternalStore` + localStorage — zero IPC round-trip, isolamento por janela (TASK-11-02-02)
- **0123:** Cleanup do filesystem validado por boundary `managedRoot` — prevenção de path traversal em delete (TASK-11-02-03)
- **0124:** Multi-window workspace — isolamento por URL param `?workspaceId=xxx` inicializando localStorage antes do mount (TASK-11-02-04)
- **0125:** Export/import ZIP com `archiver` + `yauzl`, filtragem de `SENSITIVE_PATH_SEGMENTS` e proteção zip-slip via containment (TASK-11-02-05)

## Histórico de Alterações

- 2026-04-21: Adicionadas ADRs 0121-0125 (11-features/02-workspaces — persistência híbrida, active workspace, cleanup boundary, multi-window, export/import ZIP)
- 2026-04-21: Adicionadas ADRs 0111-0120 (11-features/00-chat — composer, transcript, tool renderers, attachments, markdown, permissions, model selector, voice input, search, legacy parity)
- 2026-04-21: Renumeradas ADRs 0095-0099 → 0106-0110 (épico 10A-ajustes, após 10-ui-shell)
- 2026-04-21: Adicionadas ADRs 0100-0105 (10-ui-shell — WindowManager, TanStack Router, theme, @g4os/ui, PlatformProvider, AppShell)
- 2026-04-20: Criados ADRs granulares por task: 0081-0086 (08-sources-mcp) e 0091-0094 (09-auth)
- 2026-04-19: Adicionadas ADRs 0073-0077 (07-agent-framework — shared broker, OpenAI, Google, streaming, permissions)
- 2026-04-19: Adicionada ADR 0072 (07-agent-framework — CodexAgent)
- 2026-04-19: Adicionada ADR 0071 (07-agent-framework — ClaudeAgent)
- 2026-04-19: Adicionada ADR 0070 (07-agent-framework)
- 2026-04-19: Adicionadas ADRs 0060-0065 (06-observability)
- 2026-04-18: Adicionada ADR 0040 (data-layer)
- 2026-04-18: Adicionadas ADRs 0030-0032 (process-architecture)
- 2026-04-17: Adicionadas ADRs 0010-0013 (kernel)
- 2026-04-16: Adicionadas ADRs 0001-0009 (foundation)
