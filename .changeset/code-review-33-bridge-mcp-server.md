---
'@g4os/bridge-mcp-server': patch
'@g4os/desktop': patch
'@g4os/platform': patch
'@g4os/agents': patch
---

Code Review 33 — packages/bridge-mcp-server — exhaustive review of the skeleton + integration surface.

Escopo: pacote inteiro (`src/index.ts`, `package.json`, `tsconfig.json`, `tsup.config.ts`) + sites de integração no desktop (`platform/runtime-paths.ts`, `apps/desktop/src/main/startup-preflight-service.ts`, `apps/desktop/scripts/bundle-runtimes/index.ts`, `agents/codex/bridge-mcp/connect.ts`).

Estado: o pacote é um skeleton (`startBridgeMcpServer` sempre retorna `err()`) mas já é referenciado por preflight, runtime paths e bundle script. A surface area está congelada em uma forma que viola múltiplas convenções e vai gerar dívida quando promovido. **20 findings** — 4 MAJOR, 9 MEDIUM, 7 LOW.

---

**F-CR33-1 — Runtime path artifact mismatch garante "recoverable" eterno (MAJOR)**.
`packages/platform/src/runtime-paths.ts:51-54` resolve `bridgeMcpServer()` como `<runtimeDir>/bridge-mcp-server/index.js`. `validateRuntimeIntegrity()` (linhas 91-105) inclui esse path na checklist obrigatória. Mas `packages/bridge-mcp-server/tsup.config.ts` constrói para `packages/bridge-mcp-server/dist/index.{js,cjs}` — não há nenhum step em `apps/desktop/scripts/bundle-runtimes/index.ts:112` que copie esse dist para `<output>/runtime/bridge-mcp-server/`. Comentário no próprio bundle-runtimes admite o gap ("populou bridge-mcp-server/session-mcp-server/etc ainda"). Resultado: o preflight em `startup-preflight-service.ts:188-195` sempre vai disparar `runtime.missing`, severidade `recoverable`, em **todo** boot — em dev e em prod packaged. O sinal vira ruído permanente; quando o bridge real chegar, o operador já filtra `runtime.missing` mentalmente. ADR-0012 (Disposable, lifecycle observável) e CLAUDE.md `Architecture: Critical Execution Path` exigem startup determinístico. **Fix:** ou (a) remover `bridge-mcp-server` da checklist `validateRuntimeIntegrity` enquanto skeleton — gate por `if (skeletonMode) skip` —, ou (b) adicionar step em `bundle-runtimes` que produz placeholder real (e atualizar a checklist quando substituído pela impl real). Recomendo (a) com TODO + link de TASK-18-01. ADR-0012, ADR-0153.

**F-CR33-2 — `BridgeMcpConnector` (codex) não importa nem implementa contrato deste pacote (MAJOR)**.
`packages/agents/src/codex/bridge-mcp/connect.ts:1-40` define `BridgeMcpConnector` com `attach(url: string)` puro — não importa `@g4os/bridge-mcp-server` e não consome `BridgeMcpServerHandle`. CLAUDE.md (linha "CodexAgent já tem `BridgeMcpConnector` skeleton — basta apontar pra `handle.url`") promete que o contrato deste pacote casa com o connector do Codex; concretamente, **não casa**. `BridgeMcpHandle` em `connect.ts:9-12` (`{ url, attachedAt }`) e `BridgeMcpServerHandle` em `bridge-mcp-server/src/index.ts:49-54` (`{ url, dispose }`) divergem nos campos. Quando o skeleton for promovido, alguém vai reconciliar à mão e provavelmente vai escolher um dos dois — perdendo `attachedAt` (telemetria) ou `dispose` (lifecycle). **Fix:** `BridgeMcpConnector` deve importar `BridgeMcpServerHandle` deste pacote como type-only e reusar — ou explicitar via JSDoc que são dois lados (server-side vs client-side) com mapping documentado. ADR-0070 (contract isolation), ADR-0072 (CodexAgent).

**F-CR33-3 — `ErrorCode.UNKNOWN_ERROR` mascara skeleton de bug real (MAJOR)**.
`src/index.ts:71-76` retorna `err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, ... }))`. `error-codes.ts:83` documenta `UNKNOWN_ERROR: 'unknown.error'` na seção `// Generic` — semanticamente é "bug, não esperado". Skeleton "feature off" é estado **esperado** (configuração ainda não promovida), não um bug. Caller que faz `switch (err.code)` para distinguir bug (UNKNOWN_ERROR → Sentry) de "feature off" (mostrar UI degradada) é forçado a inspecionar `message` (string-matching frágil). ADR-0011 §"Erros esperados são tipos, não exceptions" — sentinel discriminável é obrigatório. Mesmo problema em `session-mcp-server/src/index.ts:108` e `usage-reconcile-worker/src/index.ts:88,99`. **Fix:** adicionar `BRIDGE_MCP_DISABLED` (ou genérico `FEATURE_DISABLED: 'feature.disabled'`) em `error-codes.ts`, ou expor sentinel discriminável dedicado (`BridgeMcpDisabledError extends AppError`). ADR-0011.

**F-CR33-4 — `tsconfig.json` `noEmit: true` + `tsup` build é inconsistência declarada (MAJOR)**.
`packages/bridge-mcp-server/tsconfig.json:3` define `noEmit: true`, `outDir: ./dist`, `rootDir: ./src`. `tsup.config.ts:1-11` produz dist via tsup separadamente. Os dois produtores de "build" coexistem sem coordenação — `pnpm typecheck` (`tsc --noEmit`) ignora dist; `pnpm build` (tsup) ignora `tsconfig.json` exceto via tsup-internal resolver. Quando o bridge for promovido para shipar via `runtime/bridge-mcp-server/index.js` (F-CR33-1), há ambiguidade sobre qual artefato é canônico. Compare com `packages/sources/src/mcp-stdio/sdk-client.ts:142` que carrega o SDK MCP via `import(/* @vite-ignore */ clientSpec)` para evitar exatamente esse acoplamento de build — há um padrão estabelecido que este pacote ignora. Pior: ESM (`index.js`) vs CJS (`index.cjs`) ambos gerados, mas `runtime-paths.ts:53` hardcoda `.js`. **Fix:** decidir agora qual transport binda (provavelmente CJS para shebang Node spawn, alinhado com V1 `apps/electron/resources/bridge-mcp-server/index.js` que era CJS bundle), remover `dts: true` do tsup (skeleton não exporta tipos pra apps externos via dist, e `package.json` aponta `types: src/index.ts`), e explicitar `format: ['esm']` ou `['cjs']` apenas. ADR-0144.

---

**F-CR33-5 — `BridgeMcpServerOptions.authToken` sem validação (MEDIUM)**.
`src/index.ts:32-33`: `readonly authToken: string`. JSDoc diz "Token efêmero exigido em todas as conexões de client". Mas `string` aceita `''` e o skeleton não valida. Quando promovido, primeiro implementador esquece o guard → bridge aceita conexão de processo arbitrário do OS (item 4 do JSDoc do header se torna letra morta). Não há `Zod.string().min(32)` nem brand `BridgeAuthToken`. **Fix:** trocar para `BridgeAuthToken` branded type + factory `createBridgeAuthToken()` em `@g4os/kernel/types` que valida entropia mínima (32 chars hex). Padrão já usado em `@g4os/credentials/RotationOrchestrator`. ADR-0011, CLAUDE.md "Padrões obrigatórios".

**F-CR33-6 — `onToolCall` sem `AbortSignal` (MEDIUM)**.
`src/index.ts:37-41`: `onToolCall: (name, args) => Promise<Result<unknown, AppError>>`. MCP tool calls podem rodar segundos a minutos (HTTP fetch, filesystem heavy, etc.). Sem `AbortSignal` na assinatura, o bridge não consegue cancelar quando: (a) cliente desconecta mid-call, (b) `dispose()` é chamado, (c) timeout do agent externo. ADR-0070 §"`AgentEvent` união discriminada" + ADR-0071 ("AbortSignal propagado em dispose/interrupt/unsubscribe") estabelecem a regra. CLAUDE.md "Padrões obrigatórios" reforça. **Fix:** assinatura `onToolCall: (name, args, signal: AbortSignal) => Promise<Result<...>>`. ADR-0070, ADR-0071.

**F-CR33-7 — `BridgeMcpServerHandle.dispose` não declara `IDisposable` nem idempotência (MEDIUM)**.
`src/index.ts:49-54`: `dispose(): Promise<void>` solto. Não estende `IDisposable` (`@g4os/kernel/disposable`), não documenta idempotência (chamar dispose 2x deve ser no-op, ADR-0012 §"Toda classe que registra listener, timer..."), não retorna `Result`. Compare com `ISource extends IDisposable` (ADR-0081) — toda surface assíncrona equivalente do repo já estende. Quando promovido, vai surgir um zoológico de `dispose` semantics e double-dispose vai gerar erros silenciosos (V1 history). ADR-0012, ADR-0030 (revogada por 0145 mas a doutrina dispose persiste). **Fix:** `BridgeMcpServerHandle extends IDisposable` (forçar `dispose(): void` síncrono OU `disposeAsync(): Promise<void>` documentado), declarar idempotência, e fornecer `DisposableBase`-friendly factory. ADR-0012.

**F-CR33-8 — `BridgeMcpToolSpec.inputSchema: Record<string, unknown>` ignora Zod (MEDIUM)**.
`src/index.ts:43-47`: schema é `Record<string, unknown>` (JSON Schema cru). Resto do codebase usa Zod (kernel/schemas, credentials, ipc, agents) — converter Zod → JSON Schema é trivial via `z.toJSONSchema()`. Bridge tools que reusarem session tools (read_file, list_dir, activate_sources já tipados em Zod) precisarão duplicar schemas e drift é certeza. CLAUDE.md "TypeScript zero `any`" + ADR-0070 §"schemas Zod para `AgentConfig`/`AgentCapabilities`/`AgentDoneReason`" estabelecem o padrão. **Fix:** `inputSchema: z.ZodTypeAny` + helper interno do pacote que converte para JSON Schema na hora de expor via SDK (mesma lógica que `@g4os/agents/tools` já tem para mapper). ADR-0011, ADR-0070.

**F-CR33-9 — Tools sem guard de unicidade — double-register silencioso (MEDIUM)**.
`src/index.ts:35`: `readonly tools: readonly BridgeMcpToolSpec[]`. Nada checa nomes duplicados. ADR-0070 estabeleceu para `AgentRegistry`: "register lança em duplicate". MCP SDK aceita registro duplicado e o último ganha — ferramenta legítima do user vira "shadow tool" silenciosa. **Fix:** validar unicidade em `startBridgeMcpServer` (ou aceitar `Map<string, BridgeMcpToolSpec>`); retornar `err(VALIDATION_ERROR)` em duplicate. ADR-0070.

**F-CR33-10 — Catalog drift: comentário recomenda `pnpm add ... -w` (MEDIUM)**.
`src/index.ts:10`: JSDoc diz "1. `pnpm add @modelcontextprotocol/sdk -w` (ou via catalog)". ADR-0153 mandates **catalog only** para deps compartilhadas; "ou via catalog" não é alternativa, é a regra. `@modelcontextprotocol/sdk` será compartilhado entre `bridge-mcp-server`, `session-mcp-server`, `sources/mcp-stdio` (já usa via `loadSdk` injetável) — drift de versão entre os três é virtualmente certeza se cada um adicionar via `pnpm add`. **Fix:** trocar comentário para "1. Adicionar `@modelcontextprotocol/sdk` ao `pnpm-workspace.yaml` catalog (ADR-0153) e referenciar como `catalog:`". ADR-0153.

**F-CR33-11 — Sem entrada em `.dependency-cruiser.cjs` (MEDIUM)**.
`grep bridge-mcp-server .dependency-cruiser.cjs` retorna vazio. Cada package isolado tem regra (`kernel-is-foundation`, `auth-isolated`, `permissions-isolated`, `sources-layering`). `bridge-mcp-server` quando promovido para registrar handlers via callback receberá pressão para importar `@g4os/data` (eventos), `@g4os/permissions` (broker), `@g4os/agents/tools` (catálogo) — sem boundary explícita, vira o saco-de-gatos da v1. **Fix:** adicionar regra `bridge-mcp-server-isolated` que permite só `kernel` (e talvez `platform` se precisar de detecção de SO). Boundaries reais se aplicam quando o pacote vira de fato implementação. CLAUDE.md "boundaries enforcadas (gate `check:cruiser`)".

**F-CR33-12 — `onToolCall` sem contexto de cliente/sessão (MEDIUM)**.
`src/index.ts:37-41`: callback recebe só `name` + `args`. ADR-0134 (`PermissionStore` SHA-256 args hash) e ADR-0072 (CodexAgent multi-turn isolation via `requestId` filter) demandam que toda invocação de tool carregue contexto: `sessionId`, `clientId` (qual external agent invocou), `requestId` (correlation pra audit log). Sem esse contexto: (a) permission broker não consegue aplicar policies per-session, (b) audit log não distingue qual external agent fez o que. ADR-0134, ADR-0072. **Fix:** `onToolCall(name, args, ctx: { clientId; sessionId; requestId; signal })`.

**F-CR33-13 — `BridgeMcpToolSpec` sem `permissions`/`isReadOnly`/`outputSchema` (MEDIUM)**.
Tools podem ler ou escrever — `write_file` é destrutivo, `list_dir` não. ADR-0134 (`PermissionStore`) keya decisões por `(toolName, argsHash)` mas precisa metadata para classificar default policy (`read_only` → autoallow se workspace permite, `write` → sempre prompt). Bridge re-expondo tools sem essa metadata força permission broker a sempre-prompt mesmo para `list_dir`. **Fix:** `BridgeMcpToolSpec` ganha `kind: 'read' | 'write' | 'destructive'` + `outputSchema` opcional. ADR-0134.

---

**F-CR33-14 — `tsup.config.ts` produz `dts: true` mas `package.json` aponta `types: src/index.ts` (LOW)**.
`tsup.config.ts:5`: `dts: true`. `package.json:8`: `"types": "./src/index.ts"`. Os `.d.ts` gerados em dist são morto — ninguém os consome. Custo: build mais lento, dist maior. **Fix:** `dts: false` (consistência com pacotes `src/`-resolved do monorepo). Nota: outros pacotes skeleton (`session-mcp-server`, `usage-reconcile-worker`) têm o mesmo problema.

**F-CR33-15 — `BridgeMcpServerHandle.url: string` sem schema (LOW)**.
`src/index.ts:51-52`: `readonly url: string`. JSDoc dá exemplo "`stdio://...` ou `ws://...`" mas `string` aceita qualquer coisa. `BridgeMcpConnector.attach(url)` em codex aceita any-string. Quando o ADR de transport pendente for resolvido e o transport mudar (ex.: stdio → unix socket), nada quebra em compile time. **Fix:** branded `BridgeMcpUrl` ou union literal `\`stdio://${string}\` | \`unix://${string}\``. ADR-0011.

**F-CR33-16 — Skeleton sem testes characterization (LOW)**.
`vitest run --passWithNoTests` em `package.json:22` passa mesmo sem tests. Surface area (4 interfaces + 1 function) não tem character test que congele shape. Ao promover, refactor pode quebrar consumers (codex bridge connector) sem detecção. CLAUDE.md "Contract: 100% das procedures". **Fix:** adicionar `__tests__/contract.test.ts` que valida shape via Zod runtime + teste explícito de "skeleton retorna err com código X" (vai pegar regressão se ErrorCode mudar — F-CR33-3).

**F-CR33-17 — `_options` parameter prefix força custos de setup ao caller (LOW)**.
`src/index.ts:65-77`: `startBridgeMcpServer(_options: BridgeMcpServerOptions)`. Caller precisa construir `authToken` (gerar entropia), `tools` (lista completa), `onToolCall` (closure que captura ToolCatalog inteiro) só pra tomar `err(skeleton)`. **Fix:** export `isBridgeMcpServerEnabled(): boolean` predicate (retorna `false` no skeleton) — caller checa antes de montar opções. Padrão idiomático para feature flags. ADR-0011.

**F-CR33-18 — `BridgeMcpServerOptions.tools` aceita zero tools (LOW)**.
`readonly tools: readonly BridgeMcpToolSpec[]` — array vazio é válido. Bridge sem tools é no-op operacional (cliente external conecta, vê 0 tools, desconecta). Não há sinal pra detectar config errada. **Fix:** `[BridgeMcpToolSpec, ...BridgeMcpToolSpec[]]` (NonEmptyArray) — ou validação runtime que retorna `err(VALIDATION_ERROR)`. ADR-0011.

**F-CR33-19 — JSDoc do header referencia `STUDY/Audit/Tasks/` no repo vizinho (LOW)**.
`src/index.ts:23`: "Rastreado em: TASK-18-01 (`STUDY/Audit/Tasks/18-v1-parity-gaps/`)." CLAUDE.md §"Comentários e documentação" — "Nunca referencie código atual ou tasks transitórias ('usado por X', 'fix do issue #123') — isso pertence ao PR description e apodrece à medida que o codebase evolui." TASK-18-01 não está em `G4OS-V2/` (está em `../G4OS/` repo vizinho) — link impossível de validar via gate. **Fix:** mover rastreamento para PR description / changeset e remover do source comment. CLAUDE.md.

**F-CR33-20 — V1 parity drift no shape do bundle (LOW)**.
V1 `apps/electron/resources/bridge-mcp-server/index.js` (18276 LOC) é bundle CJS standalone com `#!/usr/bin/env node` shebang — Node spawnable direto. V2 skeleton tsup config produz dual ESM+CJS sem shebang nem ponto de entrada CLI. Quando promovido, esquema de spawn vai exigir wrapper (ou `node --experimental-vm-modules` para ESM, ou shebang manual via `--banner`). **Fix:** alinhar tsup com `format: ['cjs']` + `banner: { js: '#!/usr/bin/env node' }` + `chmod +x` post-build. Ou documentar explicitamente que o bridge V2 será spawnado via `node bridge-mcp-server/index.js` (sem shebang). Decisão pertence ao ADR pendente.

---

## Áreas cobertas

- [x] Stdio protocol (skeleton — sem framing real ainda; gap documentado em F-CR33-20)
- [x] Reconnect (não aplicável a skeleton; quando promovido, ADR-0083 aplicável)
- [x] Supervisor / subprocess lifecycle (F-CR33-1 runtime artifact; F-CR33-7 dispose)
- [x] Probe vs client (não aplicável — bridge é o server, não consumer)
- [x] SDK-backed (F-CR33-10 catalog drift; F-CR33-4 build artifact)
- [x] AbortSignal propagation (F-CR33-6)
- [x] Result pattern ADR-0011 (F-CR33-3, F-CR33-5, F-CR33-15, F-CR33-17, F-CR33-18)
- [x] Disposable ADR-0012 (F-CR33-7)
- [x] Process leak detection (não aplicável — skeleton sem spawn)
- [x] Boundary check (F-CR33-2 contract drift codex; F-CR33-11 cruiser missing)
- [x] Logs estruturados (não aplicável — skeleton sem stderr capture)
- [x] Catalog drift ADR-0153 (F-CR33-10)
- [x] TypeScript strict (F-CR33-8 `Record<string, unknown>` vs Zod)
- [x] TODO/FIXME/console.log/debugger (nenhum encontrado)
- [x] V1 parity (F-CR33-20)
- [x] Tools registry idempotência (F-CR33-9)
