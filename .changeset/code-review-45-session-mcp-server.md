---
'@g4os/session-mcp-server': patch
---

Code Review 45 — packages/session-mcp-server — 9 findings (1 BLOCKER + 3 MAJOR + 4 MEDIUM + 1 LOW).

Pacote skeleton (1 arquivo, 115 LOC). `startSessionMcpServer` é stub que sempre retorna `err`. Apesar disso, o contrato exposto carrega problemas reais que petrificam decisões erradas para os consumers (IDE extension, headless CLI, subagents) que vão importar `SessionDataAdapter`/`SESSION_MCP_TOOLS` antes da implementação real chegar — corrigir agora é barato; corrigir depois quebra clientes.

Notas transversais:
- Pacote sem testes (`vitest run --passWithNoTests`); zero validação de superfície contra os ADRs citados.
- `dist/` está commitado mas o `.gitignore` do repo já lista `dist/` (linha 2). Sinal de drift de tooling — investigar se o changeset prévio fez commit acidental ou se o runtime bundling depende disso.
- `runtimePaths.sessionMcpServer()` (em `@g4os/platform`) e `validateRuntimeIntegrity()` referenciam `runtimeDir/session-mcp-server/index.js` como runtime separado, mas o `package.json` do skeleton tem `"main": "./src/index.ts"` (TS, não bundle JS pra runtime externo). Essa decisão fundamental precisa de ADR antes do skeleton virar implementação — caso contrário o probe de integrity mente tanto antes quanto depois.

---

## F-CR45-1 — `dispose()` async viola contrato `IDisposable` (BLOCKER)

- **Severidade:** BLOCKER (contrato petrificado bloqueia integração V2-wide)
- **Arquivo:** `packages/session-mcp-server/src/index.ts:79`, `:53`
- **ADR:** ADR-0012 (Disposable pattern)

`SessionMcpServerHandle.dispose(): Promise<void>` quebra o contrato canônico do V2: `IDisposable.dispose(): void` (`packages/kernel/src/disposable/types.ts:2`). `BridgeMcpServerHandle` em `packages/bridge-mcp-server/src/index.ts:53` repete o mesmo bug — provavelmente foram escritos juntos. Consequência: `DisposableStore.dispose()` chama de forma síncrona e ignora a Promise; em produção isso significa que pipes/sockets do MCP server **não são esperados** na sequência de graceful shutdown (5s deadline em `AppLifecycle.shutdown()`, ver `CLAUDE.md`), permitindo handles vazando após `app.exit(0)`.

**Root cause:** designer assumiu que close de pipes/sockets é assíncrono → typou async. Mas `IDisposable` da V2 é estritamente sync; cleanup async usa `IAsyncDisposable` (não existe no kernel) ou `dispose()` síncrono que dispara `void` promise interna + `AbortController` registrado.

**Fix:**
```ts
export interface SessionMcpServerHandle extends IDisposable {
  readonly url: string;
  // dispose() herdado, return void
}
```
e a função `startSessionMcpServer` precisa registrar o handle num `DisposableStore` ao retornar. Se cleanup async for inevitável, expor `closed: Promise<void>` separado e documentar que `dispose()` sinaliza intenção mas o flush é fire-and-forget.

---

## F-CR45-2 — `ErrorCode.UNKNOWN_ERROR` em "feature off" mascara falha real (MAJOR)

- **Severidade:** MAJOR
- **Arquivo:** `packages/session-mcp-server/src/index.ts:108-111`
- **ADR:** ADR-0011 (Result pattern with neverthrow)

`startSessionMcpServer` retorna `err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, ... }))` para sinalizar "skeleton — feature off". `UNKNOWN_ERROR` (`packages/kernel/src/errors/error-codes.ts:83`) é o code reservado para "exception inesperada" no `to-result.ts:12` — usá-lo aqui torna impossível distinguir "implementação ainda não landed" de "subprocess do MCP server explodiu por bug". Caller que quer fazer fallback gracioso (UI esconder feature) precisa fazer string match na mensagem, anti-pattern explícito do ADR-0011 ("contrato explícito; tipo do erro propaga").

**Fix:** introduzir `ErrorCode.NOT_IMPLEMENTED` no `error-codes.ts` (ou reusar um sentinel de skeleton existente, ex.: `FEATURE_DISABLED`). Caller passa a tratar `result.error.code === ErrorCode.NOT_IMPLEMENTED` sem se preocupar com a copy. Mesma regra aplicável em `bridge-mcp-server/src/index.ts:71`.

---

## F-CR45-3 — `authToken: string` no contrato sem brand type / sem validação (MAJOR)

- **Severidade:** MAJOR
- **Arquivo:** `packages/session-mcp-server/src/index.ts:33-34`
- **ADR:** ADR-0011 (contratos explícitos), ADR-0002 (TS strict)

`authToken: string` é o único guard do server contra connections de processo arbitrário do OS (comentário em `bridge-mcp-server/src/index.ts:14-15` deixa explícito: "bridge MCP não pode aceitar conexão de processo arbitrário"). Como `string`, qualquer coisa passa typecheck — incluindo string vazia, `'token'` literal, valor lido do env sem validação. Sem brand type (`type EphemeralAuthToken = string & { __brand: 'EphemeralAuthToken' }`) o consumer pode acidentalmente passar `sessionId` no lugar e o TS não pega.

**Fix:** declarar `EphemeralAuthToken` em `@g4os/kernel/types` (mesmo padrão de outros brand types em `WorkspaceId` etc.), com factory `createEphemeralAuthToken(): EphemeralAuthToken` que valida entropy mínima (≥32 bytes, hex). `SessionMcpServerOptions.authToken` passa a aceitar só esse tipo — força produção via factory, não literal. Aplicar simetricamente em `bridge-mcp-server`.

---

## F-CR45-4 — `payload: Record<string, unknown>` em `SessionEventView` perde tipagem do event sourcing (MAJOR)

- **Severidade:** MAJOR
- **Arquivo:** `packages/session-mcp-server/src/index.ts:53-58`
- **ADR:** ADR-0010 (event-sourced sessions), ADR-0043 (event store JSONL)

A view de evento exposta via MCP achata o payload em `Record<string, unknown>`. Isso joga fora a união discriminada que `@g4os/data/events` mantém (cada `event.type` tem schema Zod específico — `message_added`, `tool_use_started`, `permission_requested`, etc.). Consumer (IDE extension, subagent) que receber via MCP perde refinement do TS e precisa re-validar com Zod do lado dele — drift entre schemas inevitável. Nota também `type: string` (não `EventType`).

**Fix:** importar `SessionEventSchema` (ou tipo equivalente exposto) de `@g4os/data/events` e tipar `SessionEventView = z.infer<typeof SessionEventSchema>` ou união discriminada explícita. Como o pacote hoje só depende de `@g4os/kernel`, isso exige reorganização do public surface — `SessionEventView` deveria viver em `@g4os/kernel/types` ou re-export de `@g4os/data`.

---

## F-CR45-5 — `provider?: string` viola `exactOptionalPropertyTypes` no consumer (MAJOR)

- **Severidade:** MAJOR
- **Arquivo:** `packages/session-mcp-server/src/index.ts:71-72`
- **ADR:** ADR-0002 (TS strict — `exactOptionalPropertyTypes`)

`provider?: string` (e `modelId?: string`) com `exactOptionalPropertyTypes: true` (`tsconfig.base.json:17`) significa que consumer **não pode** passar `{ provider: undefined }` — só `{ }` ou `{ provider: 'anthropic' }`. Convivendo com `Result.map()` patterns que tipicamente preservam shape, isso causa TS errors silenciosos quando o data layer retornar objetos com `undefined` explícito. A regra do CLAUDE.md ("`{ x?: T }` não aceita `{ x: undefined }`") tem que ser aplicada ou no produtor (data layer normaliza pra omitir keys) ou no view type.

**Fix:** usar `provider: string | undefined` (explícito, aceita ambos) OU manter `provider?: string` e garantir que o adapter normalize via `omit-undefined`. Decisão precisa estar consistente com `SessionMessageView.content: unknown` (que aceita `undefined`).

---

## F-CR45-6 — `AbortSignal` ausente em `SessionDataAdapter` (MEDIUM)

- **Severidade:** MEDIUM
- **Arquivo:** `packages/session-mcp-server/src/index.ts:44-51`
- **ADR:** ADR-0012 (Disposable + AbortSignal idiom)

Os três métodos do adapter (`listEvents`, `listMessages`, `getMetadata`) retornam `Promise<Result<...>>` mas não aceitam `AbortSignal`. Se o MCP client desconectar mid-call, o adapter continua processando — leak garantido. Padrão do V2 (ver ClaudeAgent ADR-0071, OAuth flow ADR-0085) é `(opts: { signal?: AbortSignal })` em qualquer call assíncrona não trivial. `listEvents` em particular pode ser O(n) com `n` = número de eventos da sessão (pode ser milhares); cancellation é obrigatório.

**Fix:** adicionar `signal?: AbortSignal` em todos os 3 métodos, e documentar que o server interno faz `AbortController` por request MCP.

---

## F-CR45-7 — `SESSION_MCP_TOOLS` sem `inputSchema` viola superfície MCP padrão (MEDIUM)

- **Severidade:** MEDIUM
- **Arquivo:** `packages/session-mcp-server/src/index.ts:87-100`
- **ADR:** ADR-0144 (MCP SDK-backed client) — mesma surface MCP é esperada

`bridge-mcp-server/src/index.ts:43-47` define `BridgeMcpToolSpec` com `inputSchema: Record<string, unknown>` (campo obrigatório do MCP protocol — `tools/list` retorna isso). Aqui em `SESSION_MCP_TOOLS` cada tool tem só `name` + `description` — sem `inputSchema`. Quando o consumer (IDE extension via slot 25) for negociar capabilities, vai receber `inputSchema: undefined` e quebrar handshake com SDK real (ver `sdk-client.ts:21-27` exige `inputSchema: Readonly<Record<string, unknown>>`).

**Fix:** declarar `inputSchema` por tool — `session_list_events` tem `afterSequence` + `limit` documentados em `SessionDataAdapter.listEvents`, mas eles não aparecem no spec. Idealmente reusar `BridgeMcpToolSpec` interface (ou um superset compartilhado em `@g4os/kernel/types/mcp`).

---

## F-CR45-8 — `@modelcontextprotocol/sdk` não está pinado no `pnpm-workspace.yaml` catalog (MEDIUM)

- **Severidade:** MEDIUM
- **Arquivo:** `packages/session-mcp-server/src/index.ts:15` (referência a `pnpm add @modelcontextprotocol/sdk -w`)
- **ADR:** ADR-0153 (pnpm catalog), ADR-0144 (SDK-backed client)

ADR-0153 manda: deps usadas em ≥2 packages entram no catalog. `@modelcontextprotocol/sdk` é referenciado em 4 lugares (`session-mcp-server`, `bridge-mcp-server`, `sources/src/mcp-stdio/sdk-client.ts`, `apps/desktop/src/main/services/sources/mount-bootstrap.ts`) mas **não consta no `pnpm-workspace.yaml` catalog** nem em nenhum `package.json`. Hoje o `sdk-client.ts` faz dynamic import com `loadSdk` injetável — então funciona em testes — mas o desktop em produção tenta resolver via `node_modules` do consumer. Quando esse pacote skeleton implementar o stub, ele vai precisar adicionar — e cada um vai pinar uma versão diferente. O comentário "ou via catalog" do skeleton explicitamente reconhece o issue mas não resolve.

**Fix:** adicionar `@modelcontextprotocol/sdk: "<versão>"` no catalog do `pnpm-workspace.yaml` agora (mesmo antes do skeleton virar implementação) para forçar todos os pontos de import futuros a converger. Documentar peer-dep em `package.json` do `@g4os/sources` se for runtime-required.

---

## F-CR45-9 — Comentário do skeleton aponta para ADR pendente sem número (LOW)

- **Severidade:** LOW
- **Arquivo:** `packages/session-mcp-server/src/index.ts:18-19`, `:25-26`
- **ADR:** ADR-0001 (process), CLAUDE.md ("ADRs como contexto permanente")

JSDoc menciona "ADR de transport: compartilhada com bridge-mcp-server" e "ADR de transport pendente" sem número alocado. CLAUDE.md manda criar o ADR **antes do código** quando a decisão é não-trivial. Hoje o skeleton existe há tempo suficiente pra a decisão ser ADRável (mesmo que com status `Proposed`). Sem ADR, qualquer reviewer que tropeçar na ambiguidade stdio-vs-socket-vs-ws precisa rederivar do zero.

**Fix:** alocar próximo slot (atual highest é 0159, ver `code-review-30.md`). Stub mínimo: `Proposed` + 3 opções + decisão pendente. Atualiza JSDoc para citar "ADR-NNNN — Transport para session/bridge MCP servers".

---

## Áreas cobertas

- Lifecycle / subprocess / signal propagation: N/A (skeleton)
- AbortSignal propagation: F-CR45-6
- Reconnect (ADR-0083): N/A (skeleton, mas ADR-0083 é HTTP — pacote é stdio-MCP-server-out)
- Probe (ADR-0143): N/A
- SDK-backed (ADR-0144): F-CR45-8
- Result pattern (ADR-0011): F-CR45-2
- Disposable (ADR-0012): F-CR45-1
- Boundary: OK (depende só de `@g4os/kernel` e `neverthrow`)
- Backpressure stdio: N/A
- Logs / PII: N/A (skeleton sem log)
- TS strict (ADR-0002): F-CR45-5
- TODO/FIXME/console.log/debugger: nenhum encontrado
- Catalog drift (ADR-0153): F-CR45-8
- ADR-0145 (no utility process per session): respeitado (não spawna)
- Tools registry / idempotência: F-CR45-7
- ADR pendente: F-CR45-9
