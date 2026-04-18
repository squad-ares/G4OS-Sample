# @g4os/ipc

Contrato IPC type-safe compartilhado entre o processo main do Electron e o
renderer. Substitui os 349+ handlers `ipcMain.handle` da v1 por um único
router tRPC composto por domínio.

## Layout

```
src/
├── index.ts                    # entrada do pacote: tipo AppRouter + superjson
├── server/
│   ├── index.ts                # entrada do servidor (para apps/desktop main)
│   ├── trpc.ts                 # fábrica (router, procedure, middleware)
│   ├── trpc-base.ts            # base sem dependências de middleware
│   ├── context.ts              # IpcContext + interfaces de serviço
│   ├── root-router.ts          # composição dos routers de domínio
│   ├── middleware/
│   │   ├── authed.ts           # bloqueia chamadas não autenticadas
│   │   ├── logging.ts          # logs estruturados por requisição
│   │   ├── rate-limit.ts       # bucket por usuário/procedure
│   │   └── telemetry.ts        # placeholder para span OpenTelemetry
│   ├── routers/
│   │   ├── health-router.ts
│   │   ├── workspaces-router.ts
│   │   ├── sessions-router.ts
│   │   ├── messages-router.ts
│   │   ├── projects-router.ts
│   │   ├── credentials-router.ts
│   │   ├── sources-router.ts
│   │   ├── agents-router.ts
│   │   ├── auth-router.ts
│   │   ├── marketplace-router.ts
│   │   ├── scheduler-router.ts
│   │   └── updates-router.ts
│   └── __tests__/
└── shared/
    └── superjson-setup.ts      # registros das classes AppError
```

## Como adicionar uma procedure

1. Escolha o router de domínio correto em `src/server/routers/`.
2. Use `authed` para endpoints autenticados, `procedure` para endpoints públicos.
3. Declare schemas de input **e** output com Zod — ambos são obrigatórios:

```ts
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

export const fooRouter = router({
  rename: authed
    .input(z.object({ id: z.uuid(), name: z.string().min(1) }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.foo.rename(input.id, input.name);
      if (result.isErr()) throw result.error;
    }),
});
```

4. Lance subclasses de `AppError` (`CredentialError`, `AuthError`,
   `SessionError`, …). O `errorFormatter` em `trpc.ts` somado ao
   `shared/superjson-setup.ts` preservam a identidade da classe até o renderer.

## Como adicionar um novo router de domínio

1. Crie `src/server/routers/<domínio>-router.ts` e exporte
   `const <domínio>Router`.
2. Reexporte em `src/server/routers/index.ts`.
3. Registre na composição em `root-router.ts`.
4. Adicione um arquivo de teste ao lado em
   `routers/__tests__/<domínio>-router.test.ts`. O teste de smoke de contrato
   verifica que todo domínio tem um arquivo de router correspondente.

## Streaming

Trabalhos de longa duração (tokens do LLM, eventos de sessão) usam subscriptions
tRPC com o padrão async-generator (tRPC v11). A subscription retorna um
disposable que é chamado quando o cliente desconecta. Veja
[sessions-router.ts](src/server/routers/sessions-router.ts) — `stream` emite
`SessionEvent` e descarta via `IDisposable` ao desinscrever.

## Erros tipados pelo fio

O `shared/superjson-setup.ts` registra cada subclasse de `AppError` no
superjson. O `errorFormatter` do servidor também anexa um payload sanitizado
`appError` a todo `TRPCError.data`, para que o renderer possa reconstruir a
classe original mesmo sem a preservação de classes do superjson:

```ts
// lado do renderer
import { TRPCClientError } from '@trpc/client';
import { CredentialError } from '@g4os/kernel/errors';

function isCredentialError(e: unknown): e is CredentialError {
  return (
    e instanceof TRPCClientError &&
    (e.data as { errorType?: string } | null)?.errorType === 'CredentialError'
  );
}
```

## Middleware stack

A ordem de aplicação dos middlewares em `procedure` é:

1. `withLogging` — gera `traceId`, registra início/fim com duração
2. `withTelemetry` — placeholder para spans OpenTelemetry
3. `authed` (apenas em rotas protegidas) — valida `ctx.session.userId`
4. `rateLimit` (opcional por rota) — bucket window por usuário/procedure

## Por que existe

A v1 tinha 349+ chamadas `ipcMain.handle` espalhadas em 16 arquivos
registradores, sem schema compartilhado entre main e renderer. Este pacote
centraliza o contrato, força validação de input/output com Zod, e dá ao
renderer inferência total de tipos via tRPC.

## Testes

Rodar localmente:

```bash
pnpm -F @g4os/ipc test          # vitest run
pnpm -F @g4os/ipc typecheck     # tsc --noEmit
pnpm -F @g4os/ipc lint          # biome check
```

O `all-procedures.test.ts` aplica cobertura de contrato em todos os routers de
domínio detectados em runtime. Adicionar um router sem schema de input
quebra o teste.
