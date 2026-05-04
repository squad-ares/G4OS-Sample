---
'@g4os/session-runtime': patch
---

Code Review 46 — packages/session-runtime — 11 findings (1 MAJOR + 5 MEDIUM + 5 LOW).

Escopo: revisão exaustiva pós-CR-30 do `@g4os/session-runtime`. CR-30 endereçou drain+dispose ordering (F-CR30-3), thinking level propagation (F-CR30-2) e title vault key (F-CR30-1) — todas confirmadas aplicadas e sem regressão. Findings abaixo são incrementais.

---

### F-CR46-1 — Falta de testes para `tool-loop` / `tool-execution` / `tool-persist` / `turn-runner` / `turn-finalize` (MAJOR)

**Onde:** `packages/session-runtime/src/__tests__/` — 4 arquivos de teste, cobrindo apenas `event-log`, `mutations`, `session-event-bus`, `turn-events`.

**Causa raiz:** ADR-0135 explicitamente delegou testes do runtime para FOLLOWUP-14. CLAUDE.md afirma FOLLOWUP-14 resolvido com "22 testes em @g4os/session-runtime (bus + turn-events + event-log + mutations)" — exatamente os 4 arquivos com cobertura. Os 5 arquivos críticos do hot path (~700 LOC totais, incluindo `tool-loop.ts:runOneIteration` com 5 ramos discriminados, `tool-execution.ts` com timeout + permission race + handler error, `turn-runner.ts` com 9 cases de switch sobre `AgentEvent`) **não têm um único teste unitário**. Cenários nunca exercitados em CI:

- `runToolLoop` excedendo `MAX_ITERATIONS = 10` (boundary error)
- `runAgentIteration` recebendo `tool_use_complete` sem `tool_use_start` precedente (branch defensivo de CR-18 F-SR5 em `turn-runner.ts:125-140`)
- `executeToolUses` interrompido entre tool uses via `ctx.signal.aborted` (CR-18 F-SR1 em `tool-execution.ts:71`)
- `executeSingleTool` com `AbortSignal.any` timeout (`tool-execution.ts:217-244`) — toda a path `timeoutController.signal.aborted && !ctx.signal.aborted`
- `finalizeAssistantMessage` com `content.length === 0` short-circuit (`turn-finalize.ts:36`)
- `persistAssistantToolTurn` com erro `empty assistant turn with tool_use` (`tool-persist.ts:50-58`)

**Fix:** Criar `__tests__/tool-loop.test.ts`, `tool-execution.test.ts`, `turn-runner.test.ts`, `turn-finalize.test.ts`, `tool-persist.test.ts` cobrindo ao menos: max-iterations, abort mid-loop, timeout per-tool, permission deny, tool not found, error doneReason flush parcial, empty content short-circuit. Mockar `IAgent` via Subject<AgentEvent>, `MessagesService` via vi.fn returning ok/err, `PermissionBroker` via stub.

**ADR:** 0135 (FOLLOWUP-14 explícito), 0011 (Result pattern — paths de erro precisam ser testados), 0073 (broker — gate de permission é critical path).

---

### F-CR46-2 — `eventStoreReader` ignora `options.fromSequence` apesar do contract declarar (MEDIUM)

**Onde:** `packages/session-runtime/src/event-log.ts:116-126` vs `packages/data/src/sessions/branching.ts:36-41`.

**Causa raiz:** `EventStoreReader` em `branching.ts` declara `readReplay(sessionId, options?: { fromSequence?: number })`. O wrapper canônico `eventStoreReader` em `event-log.ts` define `async *readReplay(sessionId: string)` — assinatura sem `options`, e mesmo se passado, ignora o filtro:

```ts
async *readReplay(sessionId: string) {
  let sequence = 0;
  for await (const event of store.read(sessionId)) {
    sequence += 1;
    yield { sequence, payload: event };
  }
}
```

Hoje `branchSession` usa `if (event.sequence > input.atSequence) break` (post-filter), então funciona — mas qualquer caller futuro que passe `fromSequence` para reduzir IO terá silent drop. Dead-code option no contract é sinal de regressão futura.

**Fix:** Implementar `fromSequence` (skip enquanto `sequence < fromSequence`), OU ajustar a assinatura do wrapper para remover o parâmetro inexistente. Preferência: implementar — `branchSession` ganharia early-exit em branches profundas.

**ADR:** 0010 (event sourced sessions), 0128 (branching copy-prefix — leitura escala com prefix size).

---

### F-CR46-3 — `executeSingleTool` acumula listeners em `ctx.signal` via `AbortSignal.any` em turns com muitas tool uses (MEDIUM)

**Onde:** `packages/session-runtime/src/tool-execution.ts:221`.

**Causa raiz:** `AbortSignal.any([ctx.signal, timeoutController.signal])` registra listener em ambos os signals. O composite vai out-of-scope após o handler retornar, mas o listener instalado em `ctx.signal` (turn-scoped) só é removido quando `ctx.signal` é abortado ou GC'd. Em turn longo com 10 tool uses sequenciais, acumulam 10 listeners no mesmo signal. Não vaza entre turns (signal é descartado), mas viola a recomendação de cleanup explícito de listeners (CLAUDE.md: "Toda classe que registra listener... retorna um disposer"). Análogo ao bug que CR-18 F-SR1 corrigiu para o abortPromise no permission race (linhas 156-167).

**Fix:** Após o `clearTimeout` no `finally`, abortar `timeoutController` para liberar o composite (`AbortSignal.any` para de monitorar quando algum source aborta — mas o problema é ao revés: queremos parar de monitorar `ctx.signal` quando o handler termina sem timeout). Solução canônica: criar manualmente o composite via `addEventListener('abort', ..., { once: true })` em `ctx.signal` e remover no finally.

**ADR:** 0012 (disposable pattern — listeners precisam de cleanup explícito).

---

### F-CR46-4 — `appendCreatedEvent` não permite injeção do `eventStore` (MEDIUM)

**Onde:** `packages/session-runtime/src/event-log.ts:92-114`.

**Causa raiz:** `appendLifecycleEvent` e `emitLifecycleEvent` aceitam `eventStore?: Pick<SessionEventStore, 'append'>` para testabilidade (FOLLOWUP-14 explicitamente). `appendCreatedEvent` foi deixado de fora — instancia diretamente `new SessionEventStore(workspaceId)` na linha 99. Resultado: caller do `SessionsService.create` não pode mockar event store em testes; testes integration têm que setar fs real para diretórios `~/.config/g4os/workspaces/<id>/events/`. Inconsistência com o resto do módulo.

**Fix:** Adicionar parâmetro `eventStore?: Pick<SessionEventStore, 'append'>` em `appendCreatedEvent`, default para construção interna. Atualizar callers em `sessions-service.ts` para passar o store já instanciado pelo composition root.

**ADR:** 0011 (Result pattern), 0135 (testabilidade isolada do main).

---

### F-CR46-5 — `LoopState` não-readonly + mutação direta de `length = 0` (MEDIUM)

**Onde:** `packages/session-runtime/src/tool-loop.ts:106-112, 227-228`.

**Causa raiz:** `LoopState` interface declara `allText: string[]`, `allThinking: string[]`, `messages: Message[]`, `totalUsageInput: number` — todos mutáveis. Lógica usa `state.allText.push(...)` (linhas 138-139), `state.totalUsageInput += usage.input` (140-141), `state.messages = [...state.messages, ...]` (226), `state.allText.length = 0` (227-228). Mistura mutation de array (push, length=0) com replace immutável (`messages = [...]`). O `length = 0` é particularly anti-idiomático — preferível `state.allText = []` (consistente com `messages` e segue o mesmo padrão imutável).

Inconsistência entre os dois estilos torna o reasoning sobre invariantes mais difícil. Em particular, alguém poderia acreditar que reset entre iterations preserva referências externas (não preserva — `length = 0` muta in-place, qualquer referência guardada ficaria zerada também). Hoje sem callers externos, mas ergonomia ruim para refactor futuro.

**Fix:** Marcar mutáveis como tal (`readonly` onde apropriado) ou substituir mutação in-place por reassignação. Preferir `state.allText = []` em vez de `state.allText.length = 0`.

**ADR:** 0002 (TypeScript strict — readonly como default).

---

### F-CR46-6 — `safeStringify` em `turn-runner.ts` silencia erros de serialização sem contexto (MEDIUM)

**Onde:** `packages/session-runtime/src/turn-runner.ts:236-242`.

**Causa raiz:**
```ts
function safeStringify(value: Readonly<Record<string, unknown>>): string {
  try { return JSON.stringify(value); }
  catch { return '{}'; }
}
```

Catch silencioso — perde 100% da info quando `JSON.stringify` falha (referência cíclica, BigInt, etc.). Resultado: `inputJson: '{}'` é emitido para `turn.tool_use_started`, renderer mostra preview vazio, e nada no log indica que o agent emitiu input não-serializável. Pior: o tool é executado com input REAL no handler (não passa pelo `safeStringify`), então diverge entre o que o renderer mostra e o que executa.

**Fix:** `log.warn({ err, toolUseId, toolName }, 'tool input not JSON-serializable; preview empty')` antes de retornar `'{}'`. Idealmente, retornar `'{"_error":"non_serializable"}'` para o renderer poder distinguir input vazio legítimo de falha de serialização.

**ADR:** 0060 (logging estruturado — engolir erro silenciosamente viola).

---

### F-CR46-7 — `tool-execution.ts:75-79` — spread condicional ilegível para passar opcionais (LOW)

**Onde:** `packages/session-runtime/src/tool-execution.ts:75-79, tool-loop.ts:170-172, 220-222`.

**Causa raiz:** Pattern repetido em 4+ lugares:
```ts
...(ctx.workspaceId === undefined ? {} : { workspaceId: ctx.workspaceId }),
...(ctx.toolTimeoutMs === undefined ? {} : { toolTimeoutMs: ctx.toolTimeoutMs }),
```

Funciona por causa de `exactOptionalPropertyTypes` (não pode passar `{ x: undefined }`), mas é boilerplate verboso para uma operação trivial. Helper `omitUndefined({ x, y, z })` ou `pickDefined({ workspaceId, toolTimeoutMs })` em `@g4os/kernel/types` reduziria de 4 linhas para 1 e seria mais grepável (uma única call site).

**Fix:** Criar `omitUndefined<T>(obj: T): { [K in keyof T]: NonNullable<T[K]> }` em `@g4os/kernel/types/utils.ts` e refatorar callers. Alternativa: aceitar o boilerplate (decisão de styling — não é bug).

**ADR:** 0002 (`exactOptionalPropertyTypes`).

---

### F-CR46-8 — `runAgentIteration` race entre `subscribe()` síncrono e `onSubscription` callback (LOW)

**Onde:** `packages/session-runtime/src/turn-runner.ts:60-233`.

**Causa raiz:** Se o Observable do agent emitir `error` ou `complete` SINCRONAMENTE durante `obs.subscribe(...)` (provider que falha pre-stream), o callback `complete`/`error` invoca `settle()` ANTES de a linha 78-79 `subscription = obs.subscribe(...)` retornar. Nesse momento, `subscription` ainda é `undefined`, então `subscription?.unsubscribe()` no `settle()` é no-op. Logo após, `subscription` é atribuído mas nunca unsubscrito — ainda assim não vaza porque o Observer já completou internamente.

Adicionalmente: após `settle()` com `settled=true`, o caller via `onSubscription?.(subscription)` (linha 232) ainda recebe a subscription. Se ele chamar `subscription.unsubscribe()` externamente (cenário documentado em `turn-dispatcher.ts:96-107` que **deliberadamente NÃO faz isso por causa de F-CR36-1**), seria seguro porque o Observable já completou. Mas o risco assimetria: caller ainda recebe a sub mesmo quando ela está completa.

Practicamente safe (RxJS gerencia), mas o pattern é frágil contra providers async-mas-throw-sync (rede unavailable detectado em construção, etc.).

**Fix:** Mover a chamada `onSubscription?.(subscription)` para dentro do callback `next` (após a primeira emissão real, garantindo non-sync-completion). Ou guardar `if (settled) return;` antes do `onSubscription?.(subscription)`.

**ADR:** 0070 (IAgent com Observable como contrato), 0012 (disposable).

---

### F-CR46-9 — `interrupt()` retorna `ok(undefined)` quando sessão não tem turn ativo, mascarando programming error (LOW)

**Onde:** `packages/session-runtime/src/turn-ops.ts:37-39` + `apps/desktop/src/main/services/turn-dispatcher.ts:323-325`.

**Causa raiz:** `TurnDispatcher.interrupt()` linha 324: `if (!active) return ok(undefined)` — silently no-op quando o user clica Stop em uma session sem turn ativo. `stopTurn` no helper repassa o resultado.

UI provavelmente protege contra isso (botão Stop só aparece com turn ativo), mas o caller IPC pode mandar requisição duplicada (race entre done event chegando ao renderer e clique do user). Hoje silent-success — caller não distingue "stopped successfully" de "nothing to stop". Se o renderer assumir "stop OK = turn estava rodando", pode mostrar feedback errado.

**Fix:** Retornar `Result` com tag específica: `err(new AppError({ code: ErrorCode.NO_ACTIVE_TURN, ... }))` ou similar. Caller IPC pode tratar como benign no-op, mas o tipo expressa a intenção.

**ADR:** 0011 (Result pattern — erros esperados são tipos).

---

### F-CR46-10 — `interrupt()` aborta antes de `cancel()` no broker, mas em ordem incorreta com `agent.interrupt()` (LOW)

**Onde:** `apps/desktop/src/main/services/turn-dispatcher.ts:326-355`.

**Causa raiz:** Sequência atual em `interrupt()`:
1. `active.abortController.abort()` (sync)
2. `void active.agent.interrupt(sessionId)` (fire-and-forget; abre controller interno do agent)
3. `this.#deps.permissionBroker.cancel(sessionId)` (sync — esvazia `#sessionAllow` + rejeita pending)

Comentário CR-18 F-SR2 (em `tool-execution.ts:179-181`) afirma: "`cancel` esvaziava `#sessionAllow`, perdendo decisões `allow_session` anteriores do mesmo turn". Aqui em `interrupt()`, o `cancel` (não `cancelPendingForSession`) é chamado — esvaziar `allow_session` aqui é OK porque o turn está terminando, mas é inconsistente com a justificativa em F-SR2.

Se, em retry após interrupt, o user mandar a mesma sessão de novo no mesmo workspace, perdeu todas as decisões `allow_session` anteriores e tem que reaprovar tudo. F-SR2 justifica usar `cancelPendingForSession` para preservar — mesma lógica deveria valer aqui.

**Fix:** Trocar `permissionBroker.cancel(sessionId)` para `permissionBroker.cancelPendingForSession(sessionId)` (preservando `allow_session`). Adicionar teste que: (a) tool aprovada com `allow_session`, (b) interrupt, (c) novo turn na mesma sessão pede a mesma tool, (d) permission DEVE ser silenciosa (cached). Hoje quebraria.

**ADR:** 0073 (agent broker shared), 0134 (PermissionBroker).

---

### F-CR46-11 — Console e debugger ausentes; TODO/FIXME ausentes; TS strict respeitado (positivo)

**Verificação:** `grep -rn "TODO|FIXME|XXX|HACK|console\.|debugger" packages/session-runtime/src/` retorna zero ocorrências (excluindo dist/). `grep -rn "as any|@ts-ignore|@ts-expect-error|@ts-nocheck"` retorna apenas 1 `as unknown as SessionsRepository` em `__tests__/mutations.test.ts:29` — pattern aceito para mocks. Boundary `session-runtime-layering` enforçada — todos os imports vêm de `@g4os/{kernel,agents,data,ipc,observability,permissions}`. ADR-0152 (sources boundary) respeitado — não importa de `@g4os/sources` (correto: dispatcher é quem orquestra mount registry, não o runtime).

**Não é finding** — anotado para evidenciar áreas verdes.

---

## Áreas cobertas (sem findings — verificadas e OK)

- **AbortSignal mid-stream cancel (CR-30 F-CR30-3 ordering):** `tool-execution.ts:71` (entre iters), `:152-167` (race com permission), `:221` (composite com timeout), `tool-loop.ts:89` (entre iterations). Drain+dispose unificados em `shutdown-bootstrap.ts` confirmado em CR-30.
- **Event log atomicity (ADR-0010, 0043):** `appendLifecycleEvent` + `emitLifecycleEvent` delegam ao `SessionEventStore.append` (que faz append-only JSONL com fsync). Reducer SQLite roda DEPOIS do JSONL persistir (linha 73-78 do event-log.ts), preservando "JSONL é source of truth".
- **System message persistence (ADR-0159):** `turn-dispatcher.ts:380-406` `persistSystemError` chamado em ambos os paths (registry.create fail + loopResult.isErr não-aborted). `metadata.systemKind: 'error'` + `errorCode` discriminator correto. CR-25 F-CR25-4 confirmado: `isAbortedError` checa `context.aborted === true` (não string-match).
- **Soft delete (ADR-0126):** `lifecycleMutation` usa `applyReducer` para sync SQLite — não consulta diretamente, delega para `SessionsRepository`. Não há query direta no runtime que ignore `status = 'active'`.
- **Branching (ADR-0128):** Runtime não toca branching diretamente — `branchSession` em `@g4os/data/sessions/branching.ts` consome `eventStoreReader`/`eventStoreWriter` daqui. Wrapper sem `fromSequence` (F-CR46-2) é o único gap.
- **Title generation vault key (CR-30 F-CR30-1):** Confirmado em `title-generator.ts:44-50` — `'anthropic_api_key'` aplicado, comentário explicando o bug original presente.
- **Thinking level propagation (CR-30 F-CR30-2):** `turn-dispatcher.ts:198-213` lê `refreshedSession.metadata.thinkingLevel` e injeta em `AgentConfig`. `tool-loop.ts:170-172` e `:220-222` propagam para `finalizeAssistantMessage` e `persistAssistantToolTurn`. Persistido em `Message.metadata.thinkingLevel` em ambos os paths.
- **Result pattern (ADR-0011):** Todos os helpers retornam `Result<T, AppError>`. `turn-runner.ts:209-217` retorna `ok` com `doneReason: 'error'` quando stream falha (preserva texto parcial). `failure()` helper em `errors.ts` consistente.
- **Disposable pattern (ADR-0012):** `SessionEventBus extends DisposableBase` com `_register(toDisposable(...))`. Cleanup automático no dispose limpa o map. Listeners do bus em `subscribe()` retornam `IDisposable` próprio.
- **Boundary (cruiser `session-runtime-layering`):** verificado por `grep` de imports — só `@g4os/{kernel,agents,data,ipc,observability,permissions}`. Zero referência a `apps/desktop`, `features`, `ui`, `sources`, `credentials`, `auth`.
- **Memory leaks:** Bus `#listeners` Map cleared no dispose (`session-event-bus.ts:117`). `tool-execution.ts:142-167` removeu listener leak via `detachAbortListener` (CR-18 F-SR2). Subscription cleanup via flag `settled` em `turn-runner.ts:67-77`.
- **Race turn cancel + new turn:** `dispatchInternal` linha 120 checa `#active.has(sessionId)` antes de aceitar — segundo dispatch é rejeitado com `SESSION_LOCKED`. `cleanup()` deleta de `#active` antes do retorno do dispatch. Race window mínimo (microtask). OK.
- **Backpressure streaming:** `SessionEventBus.emit` é síncrono — sem buffer. Subscribers que não consomem rápido bloqueiam emit. Hoje OK porque tRPC subscription drain é fast (electron-trpc), mas seria fragility se subscriber fizesse IO sync. Não é regression de V1; deferir.
- **Catalog drift (ADR-0153):** package.json usa `catalog:` para `neverthrow`, `@types/node`, `vitest`. OK.
- **V1 parity:** V1 `apps/electron/src/main/sessions/turn-dispatcher.ts` tinha `MAX_ITERATIONS = 10` (igual). Persistência de erro como `role:'error'` em V1 → `role:'system'` + `systemKind:'error'` em V2 (mapeamento ADR-0159 correto). Title gen 2-fase paridade confirmada (CR-26 F-CR26-1).

---

## Sumário

- **Total:** 11 findings.
- **Severidade:** 1 MAJOR (testes faltando) + 5 MEDIUM + 5 LOW.
- **Path concentration:**
  - `tool-execution.ts` — 2 (F-CR46-3, F-CR46-7)
  - `tool-loop.ts` — 2 (F-CR46-5, F-CR46-7)
  - `turn-runner.ts` — 2 (F-CR46-6, F-CR46-8)
  - `event-log.ts` — 2 (F-CR46-2, F-CR46-4)
  - `turn-ops.ts` + `turn-dispatcher.ts` (consumer) — 2 (F-CR46-9, F-CR46-10)
  - cross-package (testes) — 1 (F-CR46-1)
- **Prioridade de remediação sugerida:** F-CR46-1 (cobertura crítica do hot path) → F-CR46-10 (UX regression em allow_session pós-interrupt) → F-CR46-3 (listener leak) → demais.
- **Recomendação:** F-CR46-1 sozinho deveria ser uma task FOLLOWUP-15 dedicada (3-4h). F-CR46-2 + F-CR46-4 + F-CR46-10 podem entrar num PR de "broker semantics + branching reader" (~2h). Os LOW podem virar single PR de tidy-up.
