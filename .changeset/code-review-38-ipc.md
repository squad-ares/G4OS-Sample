---
'@g4os/ipc': patch
---

Code Review 38 — packages/ipc — 14 findings (1 MAJOR + 6 MEDIUM + 7 LOW).

Auditoria exaustiva do contrato tRPC (server side; renderer client é coberto por outra revisão). Validações: ADR-0020 (tRPC layer), ADR-0011 (Result), ADR-0012 (Disposable), ADR-0104 (renderer isolation), ADR-0153 (catalog), ADR-0002 (TS strict), CLAUDE.md (forcing functions). Roteamento, middleware stack, subscriptions com backpressure, error serialization e cleanup de senders foram inspecionados em profundidade.

## Findings

### F-CR38-1 — `process.env` direto em `health-router.version` viola `noProcessEnv` (MAJOR)

- **File:** `packages/ipc/src/server/routers/health-router.ts:35`
- **Root cause:** `process.env['npm_package_version']` lido inline na procedure. Biome `style/noProcessEnv` está em `error` (biome.json:83); o override apenas isenta `scripts/**`, `apps/*/scripts/**` e arquivos `*.test.ts`/`*.config.ts`. `packages/ipc/src/**` não tem isenção, então este uso só passa hoje porque o gate `pnpm lint` provavelmente está rodando na raiz com cwd diferente — o arquivo viola a regra. Além disso, `process.env['npm_package_version']` só está populado quando o app é iniciado via `npm run` / `pnpm run`; no binário empacotado (Electron prod) é `undefined` → `version` cai para `'0.0.0'` permanentemente.
- **Fix:** mover a leitura para `IpcContext.appInfo.version` (já existe no `PlatformService.getAppInfo`) ou injetar `version` via factory de `healthRouter`. Em qualquer caso, sair de `process.env`. Em produção, usar `app.getVersion()` no main e propagar.
- **ADR:** ADR-0013 (platform abstraction — único ponto que toca env), CLAUDE.md "Anti-patterns" (`noProcessEnv: error`).

### F-CR38-2 — Schemas de ID redefinidos localmente em 5 routers (MEDIUM)

- **Files:**
  - `packages/ipc/src/server/routers/labels-router.ts:6` (`LabelIdSchema = z.uuid()`)
  - `packages/ipc/src/server/routers/messages-router.ts:11` (`SessionIdSchema = z.uuid()`)
  - `packages/ipc/src/server/routers/permissions-router.ts:5` (`WorkspaceIdSchema = z.uuid()`)
  - `packages/ipc/src/server/routers/projects-router.ts:18` (`ProjectTaskIdSchema = z.uuid()`)
  - `packages/ipc/src/server/routers/sources-router.ts:14` (`WorkspaceIdSchema = z.uuid()`)
  - `packages/ipc/src/server/routers/backup-router.ts:30` (`workspaceId: z.uuid()` inline)
  - `packages/ipc/src/server/routers/sessions-router-runtime.ts:61` (`requestId: z.uuid()` inline)
- **Root cause:** ADR-0153 e a convenção de schemas dizem que toda forma compartilhada vive em `@g4os/kernel/schemas`. `LabelIdSchema`, `SessionIdSchema`, `WorkspaceIdSchema`, `MessageIdSchema`, `SourceIdSchema`, `ProjectIdSchema` são exportados pelo kernel — mas vários routers redefinem `z.uuid()` localmente, perdendo brand types e qualquer enriquecimento futuro do schema (ex.: `.brand<'WorkspaceId'>()` para distinguir tipos no compilador). Drift silencioso: se kernel apertar `WorkspaceIdSchema` para `uuidv7()`, esses routers continuam aceitando v4. `ProjectTaskIdSchema` não existe no kernel — deve ser exportado lá. Para `requestId` da `respondPermission`, a convenção do `@g4os/permissions` é UUID v4 — usar um `PermissionRequestIdSchema` próprio.
- **Fix:** importar todos os ID schemas de `@g4os/kernel/schemas`; criar `ProjectTaskIdSchema` e `PermissionRequestIdSchema` lá; remover as redefinições.
- **ADR:** ADR-0020 (single source of truth para schemas), ADR-0011 (Result + tipos > comentários no CLAUDE.md).

### F-CR38-3 — `update` casts `input.patch` para `Partial<Workspace>`/`Partial<Session>` (MEDIUM)

- **Files:**
  - `packages/ipc/src/server/routers/workspaces-router.ts:62` — `input.patch as Parameters<typeof ctx.workspaces.update>[1]`
  - `packages/ipc/src/server/routers/sessions-router-core.ts:74` — `input.patch as Parameters<typeof ctx.sessions.update>[1]`
- **Root cause:** `WorkspaceUpdateSchema` / `SessionUpdateSchema` tem campos `.optional()` enquanto o service espera `Partial<Workspace>` / `Partial<Session>`. Os shapes não batem 100% (campos com `Date`, `Map`, etc. podem divergir), então o autor recorreu a `as Parameters<...>` para satisfazer o compilador. Cast quebra a garantia de tipo end-to-end (ADR-0020 "type-safety ponta a ponta") — qualquer mudança no service não dispara erro de compilação aqui. Forma correta é alinhar service signature à shape do schema (ex.: `update(id, patch: WorkspaceUpdate)`) ou exportar um adapter no kernel.
- **Fix:** trocar a assinatura do `WorkspacesService.update` (e `SessionsService.update`) para receber `WorkspaceUpdateInput` derivado do schema (`z.infer<typeof WorkspaceUpdateSchema>`); remover os casts.
- **ADR:** ADR-0020, ADR-0002 (TS strict — sem casts em superfícies tipadas).

### F-CR38-4 — `withMetrics` não captura erros (procedure throw → sample perdido) (MEDIUM)

- **File:** `packages/ipc/src/server/middleware/metrics.ts:33-45`
- **Root cause:** `withMetrics` faz `await next()` e só registra o sample após retorno. Quando a procedure lança (ex.: `throw result.error`, `throw new TRPCError(...)`), o `await` lança e o `recorder({...})` nunca executa. Resultado: métricas IPC subestimam a duração e o ok-rate, especialmente em rotas que falham em massa (rate limit, auth fail). `withLogging` também tem o mesmo bug — só usa `result.ok`, não envolve em try/finally. Diff: em `withLogging`, ao menos o log de "started" sai. Em `withMetrics`, nada.
- **Fix:** envolver `next()` em `try/catch`, registrar sample em `finally` com `ok: false` quando capturar throw. Re-throw o erro para preservar fluxo.
- **ADR:** ADR-0020 ("Logging captura 100% das chamadas — métrica em CI: log count == procedure count"), ADR-0064 (métricas IPC).

### F-CR38-5 — `rateLimit` middleware exportado mas não aplicado em nenhum router (MEDIUM)

- **Files:**
  - `packages/ipc/src/server/middleware/rate-limit.ts` (definido, exportado)
  - `packages/ipc/src/server/index.ts:67` (re-exportado)
  - 22 routers em `packages/ipc/src/server/routers/*.ts` (nenhum usa)
- **Root cause:** ADR-0020 prevê `rateLimit` como middleware composable e descreve o trade-off de memória + GC (ver `rate-limit.ts:11`). Mas nenhuma procedure de fato aplica a fábrica. Procedures hot path como `voice.transcribe` (10 MiB de payload), `messages.search` (FTS5), `globalSearch`, `migration.execute` rodam sem rate limit. Buckets em memória existem mas nunca recebem hits — o GC lazy nunca dispara porque `hitsSinceGc` nunca incrementa. Código morto que eleva o threshold de revisão (cobertura, dead-code, knip).
- **Fix:** aplicar `rateLimit({ windowMs: 60_000, max: N })` nas procedures sensíveis (`voice.transcribe`, `globalSearch`, `messages.search`, `migration.execute`, `auth.sendOtp`, `auth.verifyOtp`). Caso a decisão seja não rate-limit nada, remover o middleware e o re-export.
- **ADR:** ADR-0020 (TASK-02-03 — rate-limit como entregável), CLAUDE.md (forcing function — código importado mas não usado é candidato a knip).

### F-CR38-6 — Subscriptions sem authorization check em `sessionId` (MEDIUM)

- **Files:**
  - `packages/ipc/src/server/routers/sessions-router-subscriptions.ts:22-67` (`stream`)
  - `packages/ipc/src/server/routers/sessions-router-subscriptions.ts:74-112` (`turnStream`)
- **Root cause:** `authed` só valida `ctx.session.userId` existe. Não há validação de que o `sessionId` recebido pertence ao workspace do usuário autenticado. Hoje o app é single-user (Electron desktop), então o blast radius é zero; mas o contrato vaza para qualquer fork multi-user (Cloud Sync — ver `CloudSyncCategory` em settings) e o caller pode subscriber em qualquer UUID válido para receber eventos. Service layer (`SessionsService.subscribe`) é call-through e não valida ownership.
- **Fix:** adicionar `await ctx.sessions.get(input.sessionId)` antes de subscribe — falha com `NOT_FOUND` se o user não tem acesso. OU mover validação para o service. Documentar em ADR-0145 ou ADR de auth que assume single-user para essa decisão.
- **ADR:** ADR-0020 ("Permission/auth checks no main antes de executar handler" — implícito), ADR-0091 (auth).

### F-CR38-7 — Strings sem cap em vários inputs (DoS via payload grande) (MEDIUM)

- **Files:**
  - `packages/ipc/src/server/routers/projects-router.ts:198` — `workingDirectory: z.string()` (sem `.max()`)
  - `packages/ipc/src/server/routers/projects-router.ts:20-27` — `LegacyImportEntrySchema` campos `path/name/slug/existingId/description` sem cap
  - `packages/ipc/src/server/routers/workspace-transfer-router.ts:23` — `outputPath: z.string().min(1)` sem max
  - `packages/ipc/src/server/routers/workspace-transfer-router.ts:33` — `zipPath: z.string().min(1)` sem max
  - `packages/ipc/src/server/routers/backup-router.ts:43` — `path: z.string().min(1)` sem max
  - `packages/ipc/src/server/routers/platform-router.ts:7-9` — `FilterSchema.{name,extensions[]}` sem cap
  - `packages/ipc/src/server/routers/news-router.ts:18` — `id: z.string().min(1)` sem max
- **Root cause:** procedures de runtime (`voice.transcribe`, `globalSearch`, `messages.search`, `sendMessage`, `getFileContent`) já têm caps explícitos com justificativa. As listadas acima são paths/descrições onde um caller buggy ou hostil pode mandar 100 KB+ e atravessar todo o pipeline (zod parse, IPC serialize, service call) sem barreira. CLAUDE.md "Anti-patterns" não cobre isso, mas é boa hygiene defensiva — caps explicitam invariantes (PATH_MAX em POSIX é 4096; Windows é 32767 com `\\?\`; slugs reais ficam <128 chars).
- **Fix:** adicionar `.max()` baseado no domínio: paths em 4096, slugs em 128, ids em 256, descrições em 2000.
- **ADR:** ADR-0020 (validação Zod obrigatória), CLAUDE.md (cap em string para input não-trusted).

### F-CR38-8 — `senderFrame.url` recebido mas não validado (LOW)

- **Files:**
  - `packages/ipc/src/server/context.ts:34` (`senderFrame: { url: string } | null` no `IpcInvokeEventLike`)
  - `packages/ipc/src/server/electron-ipc-handler.ts:120-231` (handleIpcRequest não consulta senderFrame)
  - `apps/desktop/src/main/ipc-context.ts` (createContext não lê senderFrame)
- **Root cause:** o tipo expõe `senderFrame.url` mas nenhum lugar valida que é uma URL `file://` ou `http://localhost:*` (renderer trusted). Em Electron, um conteúdo carregado via `webview` ou iframe pode invocar IPC se o preload está exposto. Hoje `webPreferences` em `window-manager.ts:208` faz `contextIsolation: true` + `nodeIntegration: false` (ADR-0104), mas a defesa em camadas pede que o handler também rejeite frames não-trusted.
- **Fix:** acrescentar guard no `handleIpcRequest` (ou no `createContext` em ipc-context.ts) que rejeita se `event.senderFrame.url` não bate com o padrão renderer (`file://`, `http://localhost:5173`, devtools). Lança `FORBIDDEN`. Test no `electron-ipc-handler.test.ts` para regredir.
- **ADR:** ADR-0104 (renderer isolation — defense-in-depth), ADR-0020 ("Reduz a superfície de auditoria de segurança").

### F-CR38-9 — `agents`, `marketplace`, `scheduler` com `passthrough()` em output schemas (LOW)

- **Files:**
  - `packages/ipc/src/server/routers/agents-router.ts:11-16`
  - `packages/ipc/src/server/routers/marketplace-router.ts:9-15`
  - `packages/ipc/src/server/routers/scheduler-router.ts:10-16`
- **Root cause:** `z.object({...}).passthrough()` aceita propriedades arbitrárias além do shape declarado. ADR-0020 exige output explícito ("100% das procedures com schema"). `passthrough` é um vazamento — o renderer recebe campos que o servidor pode estar emitindo sem querer (ex.: campos sensíveis em metadata). Os comentários inline ("Schema mínimo enquanto o domínio não materializa") admitem que é placeholder, mas não é seguro por design — qualquer add no service quebra invariante de output.
- **Fix:** trocar `passthrough()` por `strict()` (rejeita extras) ou redesenhar com schemas concretos. Quando `service.list()` retornar `unknown[]`, apertar a tipagem do service primeiro, depois apertar o schema.
- **ADR:** ADR-0020 (schemas explícitos), CLAUDE.md ("tipos > comentários").

### F-CR38-10 — `health.servicesStatus` é authed-bypassed e expõe latência (LOW)

- **File:** `packages/ipc/src/server/routers/health-router.ts:39-42`
- **Root cause:** `servicesStatus` usa `procedure` (público) — qualquer caller, mesmo pré-auth, pode obter `latencyMs`/`reachable`/`endpoint` de Sentry/OTel/metrics-server. Em multi-user (futuro), isso vaza topologia de observability. No app desktop atual o blast radius é zero, mas a procedure não tem motivo de ser pública (UI é Settings → Services, atrás de auth). Custo zero apertar para `authed`.
- **Fix:** trocar `procedure` por `authed` em `servicesStatus`. `ping` e `version` ficam públicos (heartbeat).
- **ADR:** ADR-0020 ("Permission/auth checks").

### F-CR38-11 — Subscription `stream`/`turnStream` ignora `signal.aborted` antes do subscribe (LOW)

- **Files:**
  - `packages/ipc/src/server/routers/sessions-router-subscriptions.ts:30-39, 82-91`
  - `packages/ipc/src/server/routers/auth-router.ts:80-84`
- **Root cause:** se `signal` já está abortado quando o async-generator inicia (raro, mas possível em cliente que dropa na chegada), `ctx.sessions.subscribe(...)` é chamado e cria um listener desnecessário; o `disposable.dispose()` no finally limpa, mas há uma janela curta entre `subscribe` e o `while(!signal.aborted)` em que um evento pode ser empurrado e perdido — e o `disposable` permanece criado em vão. Não causa leak (o `finally` dispose), mas é trabalho desperdiçado.
- **Fix:** `if (signal?.aborted) return;` antes de `ctx.sessions.subscribe(...)`. Idem para os outros 2 subscriptions.
- **ADR:** ADR-0012 (Disposable — minimizar work em paths de cancelamento).

### F-CR38-12 — `appInfo` fallback silencioso quando `platform` é null (LOW)

- **File:** `packages/ipc/src/server/routers/platform-router.ts:42-57`
- **Root cause:** quando `ctx.platform?.getAppInfo` é null (web/headless), retorna `{ version: '0.0.0', platform: 'unknown', isPackaged: false, electronVersion: '', nodeVersion: '' }`. A UI consome e mostra "v0.0.0" como se fosse uma versão real — fail-silent. Outras procedures de platform (`openExternal`, `readFileAsDataUrl`) já lançam `PRECONDITION_FAILED`; `getAppInfo` é o único outlier. Inconsistência de contrato — caller não sabe se é "platform unavailable" vs "0.0.0 é a versão real".
- **Fix:** lançar `TRPCError({ code: 'PRECONDITION_FAILED', message: 'platform unavailable' })` em ambiente sem platform; renderer trata explicitamente (loading state OR fallback consciente).
- **ADR:** ADR-0020 ("Erros perdem identidade no renderer" — neste caso, a falha não emite erro, vira dado falso).

### F-CR38-13 — `null-services.ts` retorna `ok([])` em vez de `notImplemented` em casos onde silenciar mascara bug (LOW)

- **File:** `packages/ipc/src/server/null-services.ts:80, 94, 95, 101, 104, 105, 116, 120, 122, 121, 156, 183, 192, 197, 202`
- **Root cause:** `createNullServices` é a base usada em testes/scaffolds. Para ~15 procedures retorna `ok(...)` com payload vazio em vez de `err(notImplemented(...))`. Em testes que validam happy path, isso disfarça que o caller não está exercitando o service real. Exemplo: `sessions.runtimeStatus` retorna `{ available: false, providers: [] }` — UI nunca diferencia "not implemented" de "no providers configured". Mesmo problema em `messages.search`, `projects.list`, `labels.list`, `migration.detect`. Trade-off entre conveniência e detecção de bug.
- **Fix:** padronizar em `err(notImplemented(...))` para todos os reads não-implementados. Onde a UI legitimamente espera array vazio (auto-tests), o teste injeta o service real.
- **ADR:** ADR-0011 (Result pattern — erro explícito > silent default).

### F-CR38-14 — README desatualizado: lista 12 routers de domínio quando há 22 (LOW)

- **File:** `packages/ipc/README.md:9-39`
- **Root cause:** README mostra a estrutura de 12 routers do scaffold inicial (TASK-02-02). Hoje o `root-router.ts` tem 22 (`labels`, `permissions`, `news`, `platform`, `preferences`, `migration`, `backup`, `voice`, `windows`, `workspaceTransfer` foram adicionados após a v0). README é fonte de onboarding para LLMs e devs novos — drift de docs erode confiança e causa retrabalho de descoberta.
- **Fix:** regenerar a árvore do README a partir de `ls packages/ipc/src/server/routers/`. Considerar gate `check:readme-routers` que falha se a árvore divergir do filesystem (similar ao gate `check:exports`).
- **ADR:** ADR-0020 (catalog drift), ADR-0153 (forcing function — convenção precisa de gate).

## Áreas verificadas (sem findings)

- **Superjson + AppError serialization (`shared/superjson-setup.ts`):** todas as 9 subclasses registradas; teste em `__tests__/superjson-setup.test.ts` é o gate. ADR-0020 satisfeito.
- **`cleanupSubscriptionsForSender` em did-start-navigation/destroyed:** wired em `apps/desktop/src/main/ipc-server.ts:62-63` para todas as janelas. CR-25 F-CR25-5 (listener de abort registrado uma vez) está aplicado nos 3 subscriptions.
- **Backpressure (queue cap MAX_SUBSCRIPTION_QUEUE=100, MAX_QUEUE=32):** drop-oldest implementado; `notify` resolve corretamente.
- **`webPreferences`:** `contextIsolation: true` + `nodeIntegration: false` em `window-manager.ts:208-209`.
- **Boundary `ipc → kernel`:** dependency-cruiser respeitado; pacote não importa `electron` (dynamic import opcional fica em apps/desktop).
- **`AbortSignal` propagation:** sigtnal exposto em subscriptions, propagado para `iterator.return()` em `streamSubscription`.
- **Catalog (ADR-0153):** `package.json` usa `catalog:` para `@trpc/client`, `electron-trpc`, `neverthrow`, `superjson`, `zod`, `@types/node`. `@trpc/server@11.16.0` está pinned (não está no catalog).
- **`Result` pattern (ADR-0011):** todos os routers seguem `if (result.isErr()) throw result.error` para preservar AppError no errorFormatter — CR-18 e CR-21 fizeram retrofit, padronizado.
- **`Disposable` pattern (ADR-0012):** `subscribe`/`subscribeStream` retornam IDisposable, finally dispose garantido.
- **Channel naming:** único channel `electron-trpc` (constante exportada), sem colisão.
- **Renderer isolation (ADR-0104):** `@g4os/ipc` é process-neutral, não importa `electron` direto.
- **TS strict (ADR-0002):** zero `any` sem biome-ignore com reason; zero `@ts-ignore`/`@ts-nocheck`.
- **TODO/FIXME/console.log/debugger:** zero ocorrências em `packages/ipc/src/`.
- **Cobertura tests/all-procedures:** percorre `appRouter._def.record`; valida que toda procedure não-subscription tem `output()`. Gate funciona.
