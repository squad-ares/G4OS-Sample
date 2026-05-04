---
'@g4os/sources': patch
---

Code Review 47 — packages/sources — review exaustivo (14 findings: 2 HIGH, 5 MEDIUM, 7 LOW).

Escopo: `packages/sources/src` inteiro (interface, mcp-stdio, mcp-http, oauth, managed, lifecycle, planner, catalog, store, broker). Cruzado com ADR-0011/0012/0081/0082/0083/0084/0085/0086/0136/0137/0143/0144/0152, CR-30 F-CR30-7 e V1 (`G4OS/apps/electron/src/main/managed-connectors-runtime.ts`, ~2k LOC). Tests passam (82/82) e typecheck verde — findings são pontos cegos não cobertos pelas asserts atuais.

## HIGH

### F-CR47-1 — `tsup.config.ts` não inclui `./broker` mas `package.json` exporta (HIGH)
**Arquivo:** `packages/sources/tsup.config.ts:4-15` vs `packages/sources/package.json:50-53`.
**Causa raiz:** `package.json` declara `exports['./broker']` apontando para `./src/broker/index.ts`, e `apps/desktop/src/main/services/sources/mount-bootstrap.ts:8` importa `@g4os/sources/broker`. Mas `tsup.config.ts` lista `interface, mcp-stdio, mcp-http, managed, oauth, lifecycle, planner, catalog, store` — falta `src/broker/index.ts`. Em `pnpm dev` (`main: ./src/index.ts`) funciona, mas `pnpm build` (`tsup`) não emite `dist/broker/*`, e o produto distribuído fica sem o subpath. Em produção qualquer consumidor de `@g4os/sources/broker` quebra com `Cannot find module`.
**Fix:** adicionar `'src/broker/index.ts'` ao array `entry` do `tsup.config.ts`.
**ADR:** ADR-0152 (boundary inclui `broker`); ADR-0144 (broker é caminho de produção).

### F-CR47-2 — `McpMountRegistry.unmount` causa leak no `_store` (HIGH)
**Arquivo:** `packages/sources/src/broker/mount-registry.ts:101-111`.
**Causa raiz:** `unmount(slug)` faz `m.source.deactivate()` + `m.source.dispose()` direto, mas não chama `_store.delete(...)` para o disposable registrado em `#tryMount` (linha 152: `this._register(toDisposable(() => source.dispose()))`). Resultado: cada `unmount` deixa um `toDisposable` órfão no `DisposableStore` referenciando uma source já disposed. Em sessões de longa duração (workspaces que enable/disable sources várias vezes), o `_store` cresce indefinidamente; quando `McpMountRegistry.dispose()` finalmente roda, itera sobre N disposers fantasmas (todos no-op por idempotência, mas custo `O(N)`). `#tryMount` (linhas 169/177/192/201) usa `_store.deleteAndDispose(disp)` corretamente nos failure paths — `unmount` esqueceu de seguir o mesmo padrão.
**Fix:** capturar o `IDisposable` retornado pelo `_register` em `MountedSource` e chamar `this._store.deleteAndDispose(m.disposer)` em `unmount` em vez de `m.source.dispose()` direto.
**ADR:** ADR-0012 (Disposable hygiene); CR-30 F-CR30-7 (idempotência ok mas leak ainda existe).

## MEDIUM

### F-CR47-3 — `SourceRegistry.disposeAll` não é idempotente nem `IDisposable` (MEDIUM)
**Arquivo:** `packages/sources/src/interface/registry.ts:60-65`, `5-65`.
**Causa raiz:** `SourceRegistry` não estende `DisposableBase` nem implementa `IDisposable`. `disposeAll()` é chamado manualmente (não há contrato). Segundo chamado roda `await Promise.all(slugs.map(deactivate))` em Map vazio (no-op), mas `factories.clear()` já foi limpo — re-uso silencioso. Pior: se uma `deactivate` em paralelo lançar (`Promise.all` rejeita no primeiro), as outras sources ficam ativas e o registry fica inconsistente. Comparar com `SourceLifecycleManager` (linha 31) que estende `DisposableBase`. Quebra contrato implícito do ADR-0081 ("`SourceRegistry` centraliza ciclo de vida... `dispose()` propagado junto com `deactivate`").
**Fix:** estender `DisposableBase`; substituir `Promise.all` por `Promise.allSettled` + log de erros; renomear `disposeAll` para `dispose()` override.
**ADR:** ADR-0012; ADR-0081.

### F-CR47-4 — `McpHttpSource`: race entre `onClose`/`onError` e `disposed` (MEDIUM)
**Arquivo:** `packages/sources/src/mcp-http/source.ts:68-72, 108-117`.
**Causa raiz:** `activate()` registra `client.onClose(() => this.statusSubject.next('disconnected'))` e `client.onError(...)` sem guarda contra source já disposed. Sequência: `activate()` → callbacks subscritos → `dispose()` chama `deactivate()` (fire-and-forget via `void`) → `statusSubject.complete()` → `super.dispose()`. Se o client emitir `onClose` durante o `await client.close()` em `deactivate`, o callback executa `statusSubject.next('disconnected')` num subject que pode já ter completado, gerando log de erro silencioso do RxJS ou (em versões antigas) throw. Não há `removeListener`/equivalente no `McpHttpClient` API — o callback fica pendurado para sempre (memory leak via closure mantendo `this`).
**Fix:** (a) adicionar contract `onClose(cb): IDisposable` e `_register` o disposer; ou (b) guardar `if (this._disposed || this.statusSubject.closed) return` no início dos callbacks. Hoje `McpHttpClient.onClose` retorna `void` — assinatura precisa virar `(cb) => () => void` ou `(cb) => IDisposable`.
**ADR:** ADR-0012; ADR-0083 (reconnect depende de `status$` consistente).

### F-CR47-5 — `withReconnect` não usado em produção; reconnect ausente (MEDIUM)
**Arquivos:** `packages/sources/src/mcp-http/reconnect.ts` + busca em `apps/desktop/src` retorna 0 hits para `withReconnect`.
**Causa raiz:** ADR-0083 declara reconnect com backoff exponencial como requisito; `withReconnect` está implementado e testado (mcp-http-reconnect.test.ts). Mas não é wired em main desktop — `mount-bootstrap.ts:13` só registra `createMcpStdioFactory`, não há `createMcpHttpFactory` nem `withReconnect`. Sources `mcp-http` em produção não auto-reconnectam: ao primeiro `disconnected`/`error` o source fica permanentemente offline até dispose+activate manual. CLAUDE.md afirma "MCP HTTP com `withReconnect` (skip(1) inicial + backoff exponencial)" — claim não corresponde ao runtime atual.
**Fix:** registrar `createMcpHttpFactory` + aplicar `withReconnect` ao criar source (ou mover para dentro da factory por default), e adicionar a flag opcional para desabilitar em testes.
**ADR:** ADR-0083; ADR-0136 (subpaths que não estão wired).

### F-CR47-6 — OAuth Kit + ManagedConnectorBase + SourceLifecycleManager + SourceRegistry todos órfãos (MEDIUM)
**Arquivos:** `packages/sources/src/oauth/*`, `packages/sources/src/managed/base.ts`, `packages/sources/src/lifecycle/*`, `packages/sources/src/interface/registry.ts`. Busca em `apps/desktop/src` por `OAuthCallbackHandler|performOAuth|generatePkce|ManagedConnectorBase|SourceRegistry|SourceLifecycleManager` retorna 0 hits.
**Causa raiz:** Toda a infra de OAuth (PKCE, callback handler, loopback, `performOAuth`, `performOAuthLoopback`, `createFetchTokenExchanger`), `ManagedConnectorBase`, `SourceLifecycleManager` (intent detector + sticky/rejected) e o `SourceRegistry` global existem como código testado (51 + 9 + 36 testes) mas o composition root não cria um `OAuthCallbackHandler` no main, não registra protocol, não monta nenhum managed connector real. ADR-0086 prevê `SourceLifecycleManager.planTurn` chamado pelo `TurnDispatcher` — TurnDispatcher hoje usa `planTurn` de `@g4os/sources/planner` (função pura), não o lifecycle manager. CLAUDE.md menciona FOLLOWUP-OUTLIER-12 como "post-MVP", mas o pacote carrega o weight (~700 LOC + tests) sem sinal claro.
**Fix:** ou (a) wire mínimo no main (`OAuthCallbackHandler` registrado em `g4os://oauth/callback` + 1 `ManagedConnector` real validando o caminho), ou (b) marcar explicitamente os módulos como "skeleton — wired in FOLLOWUP-OUTLIER-12" no README do pacote para evitar a impressão de que está em uso.
**ADR:** ADR-0084, ADR-0085, ADR-0086 — wiring é parte do contrato.

### F-CR47-7 — `OAuthCallbackHandler` aceita callback com `code` mas sem validar `error` (MEDIUM)
**Arquivo:** `packages/sources/src/oauth/callback-handler.ts:30-43, 78-85` + `flow.ts:51-67`.
**Causa raiz:** `handleDeepLink` resolve qualquer `searchParams` que tenha `state`, mesmo quando IdP retorna `error=access_denied&error_description=...` (RFC 6749 §4.1.2.1). `performOAuth` então chama `params.get('code')` → null → `OAuthError.noCode()`. O usuário vê "missing authorization code" em vez de "access_denied" / "invalid_scope" / etc. Erro genérico mascara root cause real (provider rejeitou consentimento, scopes ruins, app bloqueado pelo admin).
**Fix:** em `flow.ts:performOAuth` (e `performOAuthLoopback`), checar `params.get('error')` antes de `params.get('code')` e retornar `OAuthError.exchangeFailed(`provider error: ${error}: ${errorDescription}`)` com código discriminado novo (e.g. `provider_denied`).
**ADR:** ADR-0085 (PKCE/state ok, mas RFC 6749 error params não cobertos).

## LOW

### F-CR47-8 — `probeMcpStdio` herda `process.env` completo do main (LOW)
**Arquivo:** `packages/sources/src/mcp-stdio/probe.ts:62-63`.
**Causa raiz:** `env: { ...process.env, ...(config.env ?? {}) }` injeta TODA a env do main process no MCP probe — incluindo `ANTHROPIC_API_KEY`, `SUPABASE_*`, `G4OS_*` secrets que jamais deveriam vazar para um binário de terceiro. Comentário declara que é necessário para `PATH`, mas o probe poderia herdar apenas `PATH`, `HOME`, `SHELL`, `LANG`, `USER`, `TMPDIR` + as vars explicitamente passadas. ADR-0085 menciona "PKCE para evitar code interception"; deixar a env vazar é uma fuga equivalente.
**Fix:** substituir o spread por allowlist de vars (`const ALLOWED_ENV = ['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR', 'SHELL']; const baseEnv = Object.fromEntries(ALLOWED_ENV.map(k => [k, process.env[k]]).filter(([,v]) => v !== undefined));`). Mesmo padrão se aplica ao `sdk-client.ts:76-80` que recebe env via `config.env`.
**ADR:** ADR-0050 (CredentialVault gateway único — secrets nunca em env propagada); ADR-0085 (security boundary).

### F-CR47-9 — `OAuthCallbackHandler` não valida `protocol` no `pathname` matching corretamente (LOW)
**Arquivo:** `packages/sources/src/oauth/callback-handler.ts:32-43`.
**Causa raiz:** `parsed.protocol` é `g4os:` para `g4os://oauth/callback`. `parsed.pathname` é `//oauth/callback` (URL com authority) ou `/oauth/callback` (sem). `OAuthCallbackHandler` usa default `pathname: '/callback'` mas deep link real é `g4os://oauth/callback` — pathname do `URL` parser é `/callback` (após o host `oauth`). Isto funciona por coincidência. Se alguém configurar `g4os:///callback` ou `g4os:/callback` (sem authority), `parsed.pathname` muda e o handler não matcha. Test só cobre o caminho feliz com `g4os://oauth/callback`. Falta test para variantes de URL e para `?error=access_denied`.
**Fix:** documentar formato esperado + reforçar via `parsed.host !== 'oauth'` quando aplicável; adicionar tests cobrindo edge cases.
**ADR:** ADR-0085.

### F-CR47-10 — `intent-detector.ts` cria `RegExp` por `availableSource` por turn (LOW)
**Arquivo:** `packages/sources/src/lifecycle/intent-detector.ts:108-117`.
**Causa raiz:** `extractSoftReferences` itera `available` e instancia `new RegExp(...)` por iteração, por turn. Em workspaces com 15+ managed connectors + custom MCPs, são 15+ allocs de RegExp por mensagem (e o GC eventualmente coleta). É micro-overhead, mas o detector é chamado em hot path do TurnDispatcher e o regex de `displayName` é estático por workspace — poderia ser cached por instância do detector com `Map<string, RegExp>` ou pré-calcular `escaped` no construtor.
**Fix:** memoize `RegExp` por `displayName` (Map em escopo de instância ou módulo).
**ADR:** ADR-0086.

### F-CR47-11 — `loopback.ts` retry em EADDRINUSE com porta random pode colidir (LOW)
**Arquivo:** `packages/sources/src/oauth/loopback.ts:82-104`.
**Causa raiz:** quando `port=0` falha (?), o fallback gera porta no range `[49152, 65151]` via `Math.random()` — não cryptographically random, sem checagem de colisão prévia, e ignora a posição do attempt no array. `port=0` é o ephemeral default do kernel, raríssimo de falhar; quando falha (exhaustion), tentar outro `port=0` ou random no mesmo range tem mesma probabilidade. Pior, se attempt 1 dá `EADDRINUSE` em porta X random, attempts 2/3 podem cair na mesma porta X. A intenção (3 attempts) não é uma estratégia de contornar exhaustion real.
**Fix:** usar 3x `port: 0` (deixar OS resolver) e logar; ou remover o random fallback e trustar `port: 0`.
**ADR:** ADR-0085.

### F-CR47-12 — `tool-adapter.ts` `firstValueFrom` lança em Observable que só completa (LOW)
**Arquivo:** `packages/sources/src/broker/tool-adapter.ts:69`.
**Causa raiz:** `firstValueFrom(source.callTool(...))` rejeita com `EmptyError` se o Observable completar sem emitir. `SdkMcpClient.callTool` (sdk-client.ts:99-128) sempre emite uma vez antes de complete (single-emission promise wrap), mas implementações alternativas de `McpClient` (test doubles, future SSE wrapping) podem completar sem emitir. O catch genérico transforma em `dispatch_error` com mensagem "no elements in sequence" — confunde debug do usuário (parece bug do tool, é bug do client).
**Fix:** usar `firstValueFrom(obs, { defaultValue: { content: null, isError: true, metadata: { reason: 'empty' } } })` ou explicitar erro com mensagem clara em catch.
**ADR:** ADR-0011 (Result pattern — empty source é estado válido, não exception).

### F-CR47-13 — Testes com metadata mal-formados passam por type-laundering (LOW)
**Arquivos:** `packages/sources/src/__tests__/mount-registry-timeout.test.ts:17`, `mcp-stdio-sdk-client.test.ts:12`.
**Causa raiz:** `mount-registry-timeout.test.ts:17` usa `metadata: { displayName, description: '', category: 'tool' }` — `'tool'` não está em `SourceCategory` enum, `description` não existe em `SourceMetadata`. `mcp-stdio-sdk-client.test.ts:12` usa `metadata: { provider, category: 'other', displayName }` — falta `slug` e `requiresAuth`. Tests passam porque os objetos viram parte de stubs com cast `as never` ou são apenas passados por dentro sem unwrap. Type-laundering esconde drift entre o contrato `SourceMetadata` e os tests — refactors do contrato não falham na suite local.
**Fix:** corrigir os fixtures para `SourceMetadata` exato; remover `as unknown as ISource`/`as never` sempre que não for estritamente necessário.
**ADR:** ADR-0002 (TS strict — tests também).

### F-CR47-14 — `formatPlanForPrompt` esconde sources `connecting` como "not connected" (LOW)
**Arquivo:** `packages/sources/src/planner/source-planner.ts:122-141`.
**Causa raiz:** `ready = all.filter(s => s.status === 'connected')`. Sources em `connecting` (transient durante reconnect) caem no bucket `pending` e o agent vê "Not connected (use activate_sources or ask user to authorize)" — instrução enganosa: a source vai conectar em segundos sem ação do usuário. Pior, quando um turn cai exatamente durante reconnect (race comum em MCP HTTP), o agent é instruído a "ask user to authorize" mesmo quando auth está OK e só falta latência de network.
**Fix:** distinguir `disconnected/error/needs_auth` (precisam ação) vs `connecting` (transitório, deveria ser ocultado ou listado como "Reconnecting…"); status `connecting` poderia ser tratado como `connected` para fins de plan summary com flag opcional.
**ADR:** ADR-0083 (states semântica); ADR-0086.

## Áreas cobertas

- ADR-0011 Result pattern: ✓ (oauth/flow.ts, registry.ts, source.ts, mount-registry.ts)
- ADR-0012 Disposable: ✗ `SourceRegistry` não-disposable (F-CR47-3); leak em `unmount` (F-CR47-2); McpHttpSource race (F-CR47-4)
- ADR-0081 Source interface registry: idempotência ok no activate (registry.ts:25-26); double-register protegido com throw; F-CR47-3 acima
- ADR-0082 stdio supervisor: `resolveRuntimeMode` ok; tests cobrem Windows/browser-auth/container — limitação real é env propagation (F-CR47-8)
- ADR-0083 mcp-http reconnect: backoff/jitter ok no código, **não wired** (F-CR47-5); `needs_auth` gating ok
- ADR-0085 OAuth PKCE: PKCE S256 ok, state validado em `flow.ts:60`, `code_verifier` nunca logado (search em código zerado), redirect URI exact match em `loopback.ts:127`. Faltam: error param handling (F-CR47-7), env leak no probe (F-CR47-8), URL parsing edge cases (F-CR47-9)
- ADR-0086 lifecycle: implementado, **não wired** (F-CR47-6); regex perf (F-CR47-10)
- ADR-0136 subpaths: ok; **F-CR47-1** falta `broker` em tsup
- ADR-0137 mounting: planner ok, F-CR47-14 status `connecting`
- ADR-0143 probe: distinto do client ok; SIGKILL safe; timeout ok; F-CR47-8 env
- ADR-0144 SDK-backed: dynamic import ok; close idempotente (sdk-client.ts:130-135); AbortSignal propagado em `callTool`; F-CR47-12 empty observable
- ADR-0152 boundary: ✓ `broker` é único subpath importando `@g4os/agents/tools`; nenhum outro subpath importa agents/features/UI; agents NÃO importa `@g4os/sources` direto
- CR-30 F-CR30-7 idempotência McpSource: confirmada via `_disposed`/`closed` guards; F-CR47-2 é leak ortogonal
- TS strict: ✓ no source code; ✗ nos tests (F-CR47-13)
- Logging: nenhum token em log (`grep -n "token\|verifier" oauth/*.ts | grep log` zerado); structured logger ok
- Subprocess kill safe: probe usa `SIGKILL` no `finish` (probe.ts:53), sdk-client delega ao SDK (lazy); zombies prevented
- AbortSignal: propagado em sdk-client.ts:107-111, mas `tool-adapter.ts:69` (`firstValueFrom`) não passa `defaultValue` — só aborta via Observable upstream
- Memory leaks: F-CR47-2 (unmount disposers órfãos); F-CR47-4 (McpHttpClient callbacks sem disposer)
- TODO/FIXME/console.log/debugger: ✓ zero ocorrências (`grep -rn "TODO|FIXME|XXX|HACK|console\." src` excluindo tests retornou 0)
- Catalog drift (ADR-0153): catálogo pnpm `catalog:` usado em `package.json:73-74` ✓
- V1 parity: V1 tinha 1991 LOC `managed-connectors.ts`; V2 tem `ManagedConnectorBase` mas zero connectors concretos (gap conhecido — F-CR47-6)

## Top 3

1. **F-CR47-1 (HIGH)** — `tsup` não emite `broker` subpath, package distribuído quebra em produção quem importar `@g4os/sources/broker`. Trivial de corrigir, alto impacto.
2. **F-CR47-2 (HIGH)** — `unmount` deixa disposable órfão no `_store`; em sessões longas com toggling de sources, leak proporcional ao número de unmounts.
3. **F-CR47-5 (MEDIUM)** — `withReconnect` implementado e testado, mas não wired no main. ADR-0083 não está cumprido em produção, embora CLAUDE.md afirme que está. Sources `mcp-http` ficam offline permanentemente após primeira disconnect.

## Contagem total

- 14 findings: **2 HIGH** (F-CR47-1, F-CR47-2), **5 MEDIUM** (F-CR47-3..7), **7 LOW** (F-CR47-8..14).
- Distribuição por área: broker 2 (1H+1L), interface/registry 1 (M), mcp-http 2 (M+M), oauth 4 (M+L+L+L), mcp-stdio 1 (L), lifecycle 2 (M+L), planner 1 (L), tests 1 (L). Tsup config 1 (H).
