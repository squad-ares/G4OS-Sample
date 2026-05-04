---
'@g4os/desktop': patch
'@g4os/auth': patch
'@g4os/observability': patch
---

Code Review 51 — apps/desktop — 22 findings (5 CRITICAL + 9 MAJOR + 6 MEDIUM + 2 LOW)

Foco: integração entre packages, wiring, lifecycle, boundaries, gaps onde packages prometem features mas o desktop não consome. Cada finding referencia o code-review do package que detectou o gap (CR-31..CR-50) ou aponta novo problema. Reviews de packages mostraram um padrão consistente: feature implementada mas dead-code no desktop. Esta revisão CONFIRMA o gap por path:line.

**F-CR51-1 — `permissionBroker.dispose()` nunca registrado em shutdown (CRITICAL)**.
`apps/desktop/src/main/index.ts:227-240` instancia `PermissionBroker` mas nunca chama `dispose()` no quit. CR-42 F-CR42-1 já apontou que o broker tem Deferred queue + cancel pending requests no dispose. Sem registrar em `shutdown-bootstrap.ts`, requests pendentes deixam Promises pendurados no shutdown e o handler do `ipcServer` pode emitir `turn.permission_required` para sender já destroído. Fix: adicionar `permissionBroker` em `ShutdownTargets` e `lifecycle.onQuit(() => permissionBroker.dispose())` em `shutdown-bootstrap.ts:34`. ADR-0134.

**F-CR51-2 — `SessionRefresher` nunca para após logout/relogin (CRITICAL)**.
`apps/desktop/src/main/services/auth-runtime.ts:158-162` chama `refresher.start()` quando `state.kind === 'authenticated'`, mas NUNCA chama `stop()` quando o state volta para `idle` (logout) — `SessionRefresher` não expõe `stop()` (só `dispose()`). O timer interno continua acordando para refresh com tokens vazios após logout, gerando ruído de log e potencial 401 em loop. Confirma CR-32 F-CR32-2. Fix: (a) `@g4os/auth/refresh` precisa expor `stop()` que limpa `started=false`, cancela `pending` e mantém o subject vivo; (b) `auth-runtime.ts` deve chamar `refresher.stop()` quando state for `idle`/`error`. ADR-0094.

**F-CR51-3 — `SessionRefresher.state$` não wired ao `reauthHub` (CRITICAL)**.
`apps/desktop/src/main/services/auth-runtime.ts:90` cria `ManagedLoginRequiredHub` e expõe `notifyManagedLoginRequired(reason)`, mas NUNCA subscribe `refresher.state$.subscribe(s => s.kind === 'reauth_required' && reauthHub.notify(s.reason))`. Resultado: quando o token expira e o refresher entra em `reauth_required`, o renderer não recebe o evento `auth.managedLoginRequired` — usuário fica em estado authenticated falso até hit-401 manual. Fix: adicionar subscription no fluxo após `new SessionRefresher(...)` em `auth-runtime.ts:146`. ADR-0094.

**F-CR51-4 — `RotationOrchestrator` nunca instanciado (MAJOR)**.
`grep -rn RotationOrchestrator apps/desktop/src/` retorna zero. `@g4os/credentials` exporta `RotationOrchestrator` (DisposableBase com timer; `rotation/orchestrator.ts`) mas o desktop não wira. Confirma CR-35. Sem wire, OAuth tokens nunca rotacionam — `OAuthRotationHandler` é dead-code. Fix: instanciar em `index.ts` após `createVault()`, registrar handlers (Google/Microsoft/Slack), `lifecycle.onQuit(() => orchestrator.dispose())`. ADR-0053.

**F-CR51-5 — `EntitlementService` não consumido (MAJOR)**.
`grep -rn EntitlementService apps/desktop/src/` retorna zero. `@g4os/auth/entitlement` existe e tem dev bypass + `onBypassUsed` telemetry hook, mas nenhum gate no desktop chama `entitlement.requireFeature(...)`. Confirma CR-32 F-CR32-1. Fix: instanciar no `auth-runtime.ts` ao lado do `ManagedLoginService`, expor via `IpcServiceOverrides` para procedures protegidas (sources OAuth, billing reconcile). ADR-0093.

**F-CR51-6 — Codex agent factory nunca registrada (MAJOR)**.
`apps/desktop/src/main/agents-bootstrap.ts:29-48` lista só `claude/openai/google` em `PROVIDERS`. `createCodexFactory` (de `@g4os/agents/codex`) NÃO é importada nem registrada. Confirma CR-31 — Codex está implementado (ADR-0072, 11 arquivos, 36 testes) mas o desktop não wira; sessão com `provider: 'codex'` falha em `registry.create` com `factory not found`. Fix: importar `createCodexFactory` + adicionar 4ª entrada em `PROVIDERS` ou registrar separadamente (não precisa de API key — usa subprocess local). ADR-0072.

**F-CR51-7 — Streaming operators (`batchTextDeltas`/`dropIfBackpressured`) nunca aplicados (MAJOR)**.
`@g4os/agents/streaming` exporta `batchTextDeltas(16ms)` e `dropIfBackpressured(100)` para reduzir custo IPC e proteger renderer. `grep -rn dropIfBackpressured apps/desktop/src/` retorna zero. `apps/desktop/src/main/services/turn-dispatcher.ts:261` chama `runToolLoop` direto sem pipe. Sob carga (long generations), texto delta vai 1:1 ao IPC bus. Confirma CR-31 F-CR31-3. Fix: aplicar operators na ponte agent → eventBus em `runAgentIteration` (`@g4os/session-runtime/turn-runner.ts`). ADR-0070.

**F-CR51-8 — `release-channels` package duplicado em `update-service.ts` (MAJOR)**.
`apps/desktop/src/main/services/update-service.ts:4` define `export type UpdateChannel = 'stable' | 'beta' | 'canary'`, ignorando `@g4os/release-channels` que exporta exatamente o mesmo type + `RELEASE_CHANNELS` + `feedUrlForChannel` + `rolloutPercentAt`. Confirma CR-44. `package.json` não lista `@g4os/release-channels` em deps. Fix: importar `ReleaseChannel` de `@g4os/release-channels`, adicionar em deps. Bonus: usar `feedUrlForChannel` para auto-update feed em vez de delegar tudo a electron-builder publish config. ADR-0044.

**F-CR51-9 — `withReconnect` (mcp-http) nunca aplicado em mount registry (MAJOR)**.
`apps/desktop/src/main/services/sources/mount-bootstrap.ts:11-15` registra só `createMcpStdioFactory`. Não há wire para `mcp-http` factory com `withReconnect` — ADR-0084 promete reconnect com backoff exponencial + skip(1) inicial + `needs_auth` nunca auto-retried. Confirma CR-47. Sources `mcp-http` sticky no session NUNCA montam — `buildMountedHandlers` filtra só por `mcp-stdio` dada a configuração atual. Fix: adicionar `createMcpHttpFactory({ authResolver, fetchImpl })` em `mount-bootstrap.ts:13`. ADR-0084.

**F-CR51-10 — `Sentry.setUser`/`clearUser` nunca chamados no main (MAJOR)**.
`packages/observability/src/sentry/init.ts:20` expõe `setUser`/`clearUser` no `SentryHandle`, mas `apps/desktop/src/main/index.ts` nunca subscribe `managedLogin.state$` para chamar `observability.sentry.setUser({ id: state.session.userId, email: state.session.email })` em `authenticated` e `null` em `idle`. Crashes do main vão ao Sentry sem `user` context — debugging multi-user impossível. Renderer faz isso em `renderer/observability/init-sentry.ts:91`, mas main não. Confirma CR-41. Fix: subscribe em `main/index.ts` após `authRuntime` setup. ADR-0062.

**F-CR51-11 — `loadInstallMeta` chamado sem `target` (MAJOR)**.
Confirma CR-43 F-CR43-3. Dois callers: (a) `apps/desktop/src/main/startup-preflight-service.ts:130-133` passa só `resourcesPath`+`appVersion`; (b) `apps/desktop/src/main/services/preferences-service.ts:73-76` mesmo problema. `LoadInstallMetaOptions.target` (em `@g4os/platform/install-meta.ts:130`) é o cross-check `${platform}-${arch}` que detecta build com manifesto de outro target — sem ele, o preflight aceita install-meta.json de win32 num macOS arm64 e cascata em "runtime_missing × N". Fix: passar `target: \`\${process.platform}-\${process.arch}\`` (ou helper `getRuntimeTarget()` em `@g4os/platform`). ADR-0146.

**F-CR51-12 — `rateLimit` middleware exportado mas nunca aplicado (MAJOR)**.
`packages/ipc/src/server/middleware/rate-limit.ts:23` exporta `rateLimit({ windowMs, max })`. `grep -rn rateLimit packages/ipc/src/server/routers/` retorna ZERO uses. Confirma CR-38 F-CR38-5. Procedures sensíveis (auth.sendOtp, voice.transcribe, sessions.send) não têm gate — flooding via DevTools/preload exploit possível. Fix: aplicar em routers críticos `procedure.use(rateLimit({ windowMs: 60_000, max: 5 })).input(...)`. ADR-0020.

**F-CR51-13 — `usage-reconcile-worker` nunca spawned (MAJOR)**.
`@g4os/usage-reconcile-worker` é skeleton (TASK-18-07). `grep -rn usage-reconcile apps/desktop/src/` só encontra um comentário em `messages-service.ts:116` mencionando o worker, mas nada o spawna. Confirma CR-50. `MessageMetadata.usage` é populado mas ninguém consome. Fix: ou remover o comentário e marcar como follow-up explícito, ou spawnar via `CpuPool.run('reconcileUsage', ...)` no boot quando billing config existe. Sem isso, multi-user billing não pode ser ativado. ADR-0064.

**F-CR51-14 — `bridge-mcp-server`/`session-mcp-server` não consumidos (MEDIUM)**.
Skeletons existem (TASK-18-01/02), `grep -rn @g4os/bridge-mcp-server apps/desktop/src/` retorna zero. CodexAgent espera `BridgeMcpConnector.attach(handle)` para expor session tools — sem o servidor real, agentes Codex não veem tools como `mcp_<slug>__<tool>`. Confirma CR-33/CR-45. Fix: documentar como follow-up explícito no `OPEN KNOWN ITEMS` ou wirar binary path em `binary-resolver.ts` quando o runtime existir empacotado. ADR-0072.

**F-CR51-15 — `appPaths.workspace('default')` fallback literal (MEDIUM)**.
`apps/desktop/src/main/index.ts:268` em `resolveWorkingDirectory: (session) => session?.workingDirectory ?? appPaths.workspace(session?.workspaceId ?? 'default')`. O literal `'default'` não corresponde a workspace real; tools file-write subsequentes escrevem em path órfão. Sem workspace válido, prefer falhar com `AppError` e UI mostra "criar workspace primeiro". Fix: usar a active workspace ID (de `WorkspacesService.getActive()`) ou retornar `Result.err` se ausente. ADR-0123.

**F-CR51-16 — `wireSecondInstance` não foca janela (MEDIUM)**.
`apps/desktop/src/main/services/single-instance-bootstrap.ts:88-98` apenas chama `deepLinks.handle(url)` quando há URL, e log debug quando sem URL. Comentário diz "caller pode delegar foco; aqui só logamos". Mas NENHUM caller delega — deep-link sem URL no second-instance não foca a janela existente. UX: usuário clica no shortcut 2x esperando focar e não acontece. Fix: chamar `windowManager.getMain()?.show()/focus()` quando não há URL OU mover esse comportamento para dentro de `DeepLinkHandler.handle('')`. ADR-0158.

**F-CR51-17 — `DeepLinkHandler` usa `windowManager.list()[0]` em vez de `getMain()` (MEDIUM)**.
`apps/desktop/src/main/deep-link-handler.ts:67` faz `const [existing] = this.windowManager.list();`. `WindowManager` expõe `getMain()` (linha 149) precisamente para evitar este pattern frágil — F-CR31-7 já documentou que `list()[0]` não garante "main" em multi-window/deep-link concorrente. Fix: trocar por `this.windowManager.getMain()`. ADR-0100.

**F-CR51-18 — Hardcoded pt-BR strings em dialogs nativos (MEDIUM)**.
`apps/desktop/src/main/index.ts:120,174-175` usam strings hardcoded em pt-BR (`'Build incompleta do G4 OS'`, `'G4 OS — Falha na inicialização do banco de dados'`). Mesma coisa em `startup-crash-log.ts:35,36`, `startup-preflight-helpers.ts:72`. ADR-0109 exige toda string user-visible passar por translate. Limitação: `translate` não pode ser carregado antes de `whenReady()` em alguns paths (crash log) — solução: dual-string en/pt simples ou ler locale do OS via `app.getLocale()` antes de `whenReady()` (sim, funciona, ADR-0109). ADR-0109.

**F-CR51-19 — `TMPDIR` hardcoded — quebra em Windows (MEDIUM)**.
`apps/desktop/src/main/startup-crash-log.ts:47` faz `process.env['TMPDIR'] ?? '/tmp'`. Em Windows `TMPDIR` não existe (env é `TEMP`/`TMP`), e `/tmp` não é path válido. Fix: usar `os.tmpdir()` (cross-platform) ou `app.getPath('temp')` quando Electron disponível. ADR-0013.

**F-CR51-20 — Migration writer não strip `sequenceNumber` V1 (MEDIUM)**.
`apps/desktop/src/main/services/migration/writers.ts:166-175` em `appendEvent` faz cast direto e chama `store.append(sessionId, validated)` preservando `sequenceNumber` original do V1. CR-40 F-CR40 mostra que em V2 o reducer espera sequência monotônica baseada em `session.lastEventSequence + 1`; preservar o número V1 (que pode ter gaps por delete) quebra a invariante. Fix: o writer deve recriar o `sequenceNumber` com `lastEventSequence + 1` ANTES de `store.append`, ou chamar `MessagesService.append` (que faz isso) em vez de `store.append` direto. ADR-0010.

**F-CR51-21 — Deps não-catalog em `package.json` (LOW)**.
ADR-0153 exige deps via catalog quando aplicável. `apps/desktop/package.json` lista versões hardcoded para `@anthropic-ai/sdk` (0.91.0), `@supabase/*` (2.104.1/2.52.1), `@tanstack/react-query` (5.99.2), `electron-updater` (6.8.3), `piscina` (5.1.4), `date-fns` (4.1.0), `ws` (8.20.0), além de muitas deps transitivas hoisted (`atomic-sleep`, `on-exit-leak-free`, `process-warning`, `quick-format-unescaped`, `real-require`, `safe-stable-stringify`, `sonic-boom`, `thread-stream`, `tr46`, `webidl-conversions`, `whatwg-url`, `isows`, `@pinojs/redact`, `pino-std-serializers`, `pino-abstract-transport`) que não são consumidas diretamente. Fix: mover versões diretas para `pnpm-workspace.yaml` catalog; remover as transitivas (deixar pnpm hoisting resolver). ADR-0153.

**F-CR51-22 — `as never` cast em Tray/Menu wiring (LOW)**.
`apps/desktop/src/main/index.ts:491-492` faz `Tray: electronModule.Tray as never, Menu: electronModule.Menu as never`. CLAUDE.md zera `noExplicitAny`/`@ts-ignore` mas `as never` é o mesmo escape. Causa: `tray-service.ts` define `ElectronMenuLike` com `_isMenu: never` (marker hack). Fix: substituir o marker por shape estrutural mínimo (algo como `interface ElectronMenuLike { items?: readonly unknown[] }` ou `unknown` opaco) e cast via type predicate explícito, evitando `as never`. ADR-0002.
