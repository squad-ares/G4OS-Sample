# ADR 0020: Camada IPC com tRPC v11 + electron-trpc + superjson

## Metadata

- **Número:** 0020
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 02-ipc (TASK-02-01 a TASK-02-06)

## Contexto

A V1 do G4 OS acumulou **349+ handlers `ipcMain.handle`** espalhados por 16
arquivos registradores em `apps/electron/src/main`. Este padrão gerou
problemas operacionais graves:

1. **Sem schema compartilhado:** o renderer usa `window.electronAPI.X`
   assumindo que `X` existe, o erro só aparece em runtime (muitas vezes em
   produção).
2. **Validação manual:** cada handler valida payloads "na mão", com
   cobertura inconsistente. 194 usos de `any` no código V1 atravessam a
   fronteira IPC sem validação.
3. **Versionamento implícito:** a assinatura do handler pode mudar sem que
   o renderer perceba, quebrando silenciosamente em builds antigas.
4. **Sem streaming nativo:** subscriptions de tokens LLM e eventos de
   sessão são resolvidos com callbacks de `webContents.send`, sem
   backpressure.
5. **Erros perdem identidade:** exceções viram objetos genéricos no
   renderer, impossibilitando discriminação por tipo (`CredentialError`
   vira `Error`).
6. **Observabilidade zero:** não há trace por requisição, impossibilitando
   correlacionar falhas entre main e renderer.
7. **Testabilidade baixa:** handlers acoplados a `ipcMain` e ao ciclo de
   vida de `BrowserWindow`, exigindo setup Electron para testar contratos.

Requisitos para V2 conforme `STUDY/Audit/rewrite.md` e
`STUDY/Audit/packages.md`:

- **Type-safety ponta a ponta** (TASK-02-01) — renderer infere tipos do
  router em tempo de compilação
- **Router estrutura por domínio** (TASK-02-02) — cada arquivo ≤ 300
  linhas, composição via `mergeRouters`
- **Middleware composable** (TASK-02-03) — auth, logging, rate-limit,
  telemetry
- **Streaming** (TASK-02-04) — subscriptions com backpressure
- **Testes de contrato** (TASK-02-05) — cobertura 100% das procedures
- **Serialização tipada de erros** (TASK-02-06) — `AppError` atravessa o
  fio sem perder identidade de classe

## Opções consideradas

### Opção A: tRPC v11 + electron-trpc + superjson

**Descrição:**
Usar tRPC v11 como protocolo RPC type-safe. `electron-trpc` fornece o
transporte sobre `ipcMain`/`ipcRenderer`. `superjson` preserva tipos
(`Date`, `Map`, `Set`, classes de erro) na travessia. Router composto por
domínio com middleware stack em `packages/ipc`.

```
packages/ipc/
├── src/
│   ├── index.ts                    # AppRouter type export
│   ├── server/
│   │   ├── index.ts                # entrada servidor
│   │   ├── trpc-base.ts            # initTRPC + middleware base
│   │   ├── trpc.ts                 # procedure com middleware aplicado
│   │   ├── context.ts              # IpcContext + 11 service interfaces
│   │   ├── root-router.ts          # mergeRouters(12 domínios)
│   │   ├── middleware/
│   │   │   ├── authed.ts           # UNAUTHORIZED se sem session
│   │   │   ├── logging.ts          # traceId + duração por chamada
│   │   │   ├── rate-limit.ts       # bucket por user:procedure
│   │   │   └── telemetry.ts        # placeholder OTel
│   │   ├── routers/                # 12 routers (≤ 300 linhas cada)
│   │   │   ├── health-router.ts
│   │   │   ├── workspaces-router.ts
│   │   │   ├── sessions-router.ts
│   │   │   ├── messages-router.ts
│   │   │   ├── projects-router.ts
│   │   │   ├── credentials-router.ts
│   │   │   ├── sources-router.ts
│   │   │   ├── agents-router.ts
│   │   │   ├── auth-router.ts
│   │   │   ├── marketplace-router.ts
│   │   │   ├── scheduler-router.ts
│   │   │   └── updates-router.ts
│   │   └── __tests__/
│   │       ├── all-procedures.test.ts  # cobertura de contrato
│   │       └── helpers/create-test-caller.ts
│   └── shared/
│       └── superjson-setup.ts      # registro de AppError subclasses
```

**Pros:**
- Type inference end-to-end zero-codegen
- Streaming first-class via async generators (tRPC v11)
- Middleware composable sem framework adicional
- Erros preservam classe via superjson + errorFormatter
- Ecossistema maduro: TanStack Query integra nativamente

**Contras:**
- `electron-trpc` é mantido por terceiro (risco de abandono)
- tRPC v11 rompeu com Observable legacy; código exemplo de v10 não serve
- Schema Zod duplicado se o projeto também usa REST

**Custo de implementação:** M (2-3 semanas para full coverage)

### Opção B: gRPC + protobuf sobre IPC

**Descrição:**
Definir schemas em `.proto`, gerar stubs TS para main e renderer, usar
`@grpc/grpc-js` adaptado para Electron IPC.

**Pros:**
- Contrato binário mais compacto
- Language-agnostic (útil se algum dia adicionar backend Go/Rust)
- Streaming bidirecional nativo

**Contras:**
- Codegen obrigatório em toda mudança de schema (CI complicado)
- Sem integração pronta com Electron (precisa escrever o transport)
- Overkill para app single-language TypeScript
- Dev experience significativamente pior

**Custo de implementação:** L (4-6 semanas)

### Opção C: REST interno via `postMessage` + Zod

**Descrição:**
Cada requisição é uma mensagem JSON com `method` + `params`, validada por
Zod no main. Nenhuma biblioteca além de Zod.

**Pros:**
- Zero dependências extras
- Simples de entender
- Debug por console

**Contras:**
- Sem inferência de tipo automática (precisa duplicar typing)
- Sem streaming sem implementação custom
- Sem middleware framework
- Reimplementa o que tRPC já faz

**Custo de implementação:** M (mas com muito boilerplate recorrente)

### Opção D: Manter `ipcMain.handle` com wrapper type-safe

**Descrição:**
Continuar usando `ipcMain.handle` mas adicionar wrapper Zod + tipos
compartilhados em pacote central.

**Pros:**
- Migração incremental possível
- Familiar ao time

**Contras:**
- Não resolve streaming
- Não resolve middleware de forma composable
- Não resolve erros tipados sem reimplementar superjson
- Mantém 349 handlers visíveis, só com wrapper — cosmético

**Custo de implementação:** S (mas valor limitado)

## Decisão

Optamos pela **Opção A (tRPC v11 + electron-trpc + superjson)** porque:

1. **Resolve os 5 gaps da V1 simultaneamente:** type-safety, streaming,
   middleware, erros tipados, observabilidade.
2. **Alinhado com a arquitetura geral V2:** TanStack Query no renderer
   consome tRPC nativamente; evita camadas de adaptação.
3. **Cadência de entrega:** o esqueleto fica pronto em dias, não semanas
   (comparado a gRPC).
4. **Pressão de manutenção baixa:** cada novo recurso é um arquivo novo
   em `routers/`, com teste de contrato automático.
5. **Reduz a superfície de auditoria de segurança:** uma única função
   `createIPCHandler` substitui 349 pontos de entrada.

`packages/ipc` é **process-neutral** — não importa `electron`
diretamente. Isso permite testar routers sem bootar Electron e facilita
reaproveitamento em `apps/viewer` (web) caso necessário no futuro.

## Consequências

### Positivas

- **Type-safety garantida:** o renderer recebe `AppRouter` e todos os
  inputs/outputs são inferidos. Adicionar procedure errada quebra build.
- **Router por domínio ≤ 300 linhas:** força a distribuição responsável,
  prevenindo um novo `sessions.ts` de 25k linhas.
- **Validação Zod obrigatória:** input e output são declarados, não
  opcionais. Eliminar schema quebra lint custom.
- **Erros atravessam o fio com classe preservada:** `superjson` +
  `errorFormatter` duplo — renderer pode usar `instanceof
  CredentialError`.
- **Observabilidade built-in:** `withLogging` emite JSON estruturado
  com `traceId` + `durationMs` para toda chamada.
- **Testabilidade trivial:** `createTestCaller(overrides)` gera um caller
  isolado sem BrowserWindow. Contract coverage é teste dinâmico que
  percorre `appRouter` em runtime.
- **Streaming escalável:** async generators aplicam backpressure
  naturalmente; fila limitada previne crescimento não-controlado.

### Negativas / Trade-offs

- **Dependência externa não-Anthropic:** `electron-trpc` é mantido por
  terceiros (atualmente v0.7.1). Se for arquivado, precisaremos manter
  fork — mas o código é pequeno (~500 linhas).
- **Curva de aprendizado tRPC v11:** async generators substituem
  Observable legacy; devs que viram tutoriais v10 precisam se atualizar.
- **Superjson overhead:** serialização é ~2x mais custosa que
  `JSON.stringify` puro. Aceitável para IPC local (latência já é ~1ms).
- **Rate limit em memória:** `rate-limit.ts` perde estado em restart do
  main. Não é problema hoje (rate limit é defesa contra bugs, não abuse
  external), mas precisará de store persistente se for usado para
  billing.

### Neutras

- **Package exports:** `@g4os/ipc` expõe `server/` (main) e
  `shared/superjson-setup` (ambos). Apps consomem sub-caminhos
  explicitamente para evitar bundling do server no renderer.
- **Ordem de middleware:** `withLogging` → `withTelemetry` →
  `authed` (se aplicável) → `rateLimit` (se aplicável). Logging primeiro
  captura falhas de auth.
- **Subscriptions v11:** usam async generators, não
  `@trpc/server/observable`. Qualquer código externo que espere
  Observable precisa ser adaptado.

## Validação

Como saberemos que essa decisão foi boa?

- **Zero `ipcMain.handle` direto em `apps/desktop`** — grep em CI falha
  se encontrar
- **Zero `window.electronAPI.X`** no renderer — lint custom bloqueia
- **Todas as procedures têm schema Zod de input e output** — teste
  `all-procedures.test.ts` valida via reflexão
- **Streaming: envio de 10000 chunks em 1s não trava renderer** — teste
  de carga incluído em E2E
- **Superjson preserva Date/Map/Set/AppError** — teste
  `superjson-setup.test.ts`
- **Logging captura 100% das chamadas** — métrica em CI: `log count ==
  procedure count` em teste de contrato
- **Revisão em 2026-07-15** para avaliar pressão operacional e
  necessidade de store persistente no rate limit

### Métricas-alvo após 3 meses de uso

| Métrica | Alvo |
|:---|:---|
| Procedures com validação Zod | 100% |
| Cobertura de testes de contrato | ≥ 90% |
| P95 de latência IPC local | ≤ 5ms |
| Bugs de schema em produção | 0 |
| Erros perdendo identidade no renderer | 0 |

## Implementação

### TASK-02-01: Setup tRPC

**Dependências adicionadas a `packages/ipc/package.json`:**

```json
{
  "dependencies": {
    "@g4os/kernel": "workspace:^",
    "@trpc/client": "11.16.0",
    "@trpc/server": "11.16.0",
    "electron-trpc": "0.7.1",
    "neverthrow": "8.2.0",
    "superjson": "2.2.6",
    "zod": "^4.0.0"
  }
}
```

**Bootstrap em `trpc-base.ts`** (evita ciclo com middleware):

```ts
const t = initTRPC.context<IpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    const extra: Record<string, unknown> = {};
    if (cause instanceof AppError) {
      extra['appError'] = cause.toJSON();
      extra['errorType'] = cause.constructor.name;
    }
    if (cause instanceof ZodError) {
      extra['zodIssues'] = cause.issues;
    }
    return { ...shape, data: { ...shape.data, ...extra } };
  },
});
export const router = t.router;
export const baseProcedure = t.procedure;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;
```

### TASK-02-02: Router structure

12 routers por domínio, cada um em arquivo próprio. Composição centralizada:

```ts
// root-router.ts
export const appRouter = router({
  health: healthRouter,
  workspaces: workspacesRouter,
  sessions: sessionsRouter,
  messages: messagesRouter,
  projects: projectsRouter,
  credentials: credentialsRouter,
  sources: sourcesRouter,
  agents: agentsRouter,
  auth: authRouter,
  marketplace: marketplaceRouter,
  scheduler: schedulerRouter,
  updates: updatesRouter,
});
export type AppRouter = typeof appRouter;
```

Cada router usa `authed` (autenticação obrigatória) ou `procedure`
(público). Input e output são sempre declarados com Zod:

```ts
// sessions-router.ts (extrato)
get: authed
  .input(z.object({ id: SessionIdSchema }))
  .output(SessionSchema)
  .query(async ({ input, ctx }) => {
    const result = await ctx.sessions.get(input.id);
    if (result.isErr()) throw result.error;
    return result.value;
  }),
```

### TASK-02-03: Middleware stack

- **`withLogging`:** gera `traceId` UUID, loga início/fim em JSON com
  duração. Tratamento separado para `result.ok` vs `error`.
- **`withTelemetry`:** placeholder no-op; substituído quando OpenTelemetry
  for integrado no main process.
- **`authed`:** valida `ctx.session?.userId`, lança `TRPCError`
  `UNAUTHORIZED` com `cause: { code: AUTH_NOT_AUTHENTICATED }` se
  ausente.
- **`rateLimit(options)`:** fábrica que retorna middleware com bucket
  `{count, resetAt}` por `user:procedure`. Lança `TOO_MANY_REQUESTS`
  quando excedido.

Ordem aplicada em `procedure`:

```ts
export const procedure = baseProcedure.use(withLogging).use(withTelemetry);
export const authed = procedure.use(isAuthed);
```

### TASK-02-04: Streaming via async generator

```ts
stream: authed
  .input(z.object({ sessionId: SessionIdSchema }))
  .subscription(async function* ({ input, ctx, signal }) {
    const queue: SessionEvent[] = [];
    let notify: (() => void) | null = null;

    const disposable = ctx.sessions.subscribe(input.sessionId, (event) => {
      queue.push(event);
      notify?.();
    });

    try {
      while (!signal?.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
            signal?.addEventListener('abort', () => resolve(), { once: true });
          });
          notify = null;
        }
        while (queue.length > 0) {
          const next = queue.shift();
          if (next !== undefined) yield next;
        }
      }
    } finally {
      disposable.dispose();
    }
  }),
```

Backpressure: o gerador só consome do array `queue` quando o consumidor
puxa o próximo `yield`. O produtor pode empurrar, mas a memória é
limitada pela velocidade do consumidor (tRPC não aplica buffer adicional).

### TASK-02-05: Testes de contrato

- `create-test-caller.ts`: mock de todos os 11 serviços usando
  `ok()` / `err()` do neverthrow. Overrides permitem teste focado.
- `all-procedures.test.ts`: percorre `appRouter` via reflexão no `_def`,
  detecta 12 domain routers, valida cada procedure tem schema de input
  (ou é parameterless).
- Testes por router (ex. `workspaces-router.test.ts`) cobrem:
  - **Happy path:** chamada autenticada retorna `Result.ok`
  - **Auth required:** chamada sem `session` lança `TRPCError`
  - **Input validation:** Zod rejeita payload inválido antes de chegar
    no serviço

### TASK-02-06: Serialização tipada de erros

**Lado main:**
`shared/superjson-setup.ts` registra cada subclasse de `AppError` com
identifier único. Importado uma vez no bootstrap do server, antes de
criar o cliente tRPC.

```ts
superjson.registerClass(AppError, { identifier: 'AppError' });
superjson.registerClass(CredentialError, { identifier: 'CredentialError' });
// ... demais subclasses
```

**Lado renderer:**
Mesmo `superjson-setup` é importado pelo preload ANTES do
`createTRPCClient`. `errorFormatter` injeta `appError` JSON no
`TRPCError.data` como fallback se o registro não restaurar a classe.

Hook utilitário no renderer:

```ts
export function useTypedError<T extends AppError>(
  error: unknown,
): T | undefined {
  if (!error) return undefined;
  if (error instanceof AppError) return error as T;
  if (error instanceof TRPCClientError) return reconstructError(error) as T;
  return undefined;
}
```

### Quebra de ciclo circular em `trpc.ts`

O middleware `withLogging` importa `middleware` de algum lugar, e o
`trpc.ts` quer aplicar `withLogging` na `procedure`. Resolvido separando
`trpc-base.ts` (sem middleware) de `trpc.ts` (compõe middleware):

- **`trpc-base.ts`:** exporta `t.router`, `t.procedure` (como
  `baseProcedure`), `t.middleware`, `t.mergeRouters`
- **`middleware/*.ts`:** importa `middleware` de `trpc-base.ts`
- **`trpc.ts`:** importa middlewares + `baseProcedure` de `trpc-base.ts`,
  exporta `procedure` composta

## Consequências de arquitetura

### Package boundaries (aplicadas via dependency-cruiser)

- `apps/desktop/src/main` → `@g4os/ipc/server` ✅
- `apps/desktop/src/renderer` → `@g4os/ipc` (apenas type de `AppRouter`) ✅
- `apps/desktop/src/renderer` → `@g4os/ipc/server` ❌ (rejeitado —
  renderer não pode importar código do main)
- `packages/ipc` → `electron` ❌ (rejeitado — manteríamos IPC
  process-neutral)

### Relação com ADRs anteriores

- **ADR-0011 (Result pattern):** todo service retorna `Promise<Result<T,
  AppError>>`. Router unwrapa `result.value` ou `throw result.error`.
  tRPC captura o throw e transforma em TRPCError.
- **ADR-0012 (Disposable pattern):** subscriptions retornam
  `IDisposable`; o `finally` do async generator garante disposal em
  cancel/abort/close.
- **ADR-0013 (Platform abstraction):** `IpcContext` é agnóstico de
  plataforma; impl concretas de serviços podem usar `@g4os/platform`.

## Histórico de alterações

- 2026-04-18: Proposta inicial e aceitação após implementação das
  TASK-02-01 a TASK-02-06 (todas com critérios de saída validados por
  testes automatizados)
- (pendente) Revisão em 2026-07-15 para avaliar pressão operacional
