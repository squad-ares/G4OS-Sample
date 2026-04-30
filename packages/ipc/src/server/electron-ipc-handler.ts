/**
 * Substitui o `createIPCHandler` do electron-trpc@0.7.1 no processo main.
 *
 * electron-trpc@0.7.1 foi escrito para tRPC v10 e não funciona com tRPC v11:
 *   1. Usa `i(n)` para chamar procedimentos — que em v11 lança
 *      "This is a client-only function".
 *   2. Tenta chamar `router.getErrorShape(...)` — que não existe em v11.
 *   3. Como resultado, toda query de IPC fica pendente para sempre, porque
 *      `event.reply` nunca é chamado.
 *   4. Espera que subscriptions retornem Observable (`.subscribe()`) — mas
 *      tRPC v11 usa async generators (`async function*`), que tem
 *      `Symbol.asyncIterator` em vez de `.subscribe()`.
 *
 * Esta implementação usa as APIs corretas do tRPC v11:
 *   - `appRouter.createCaller(ctx)` para invocar procedimentos
 *   - `getErrorShape` standalone para formatar erros
 *   - `transformTRPCResponse` para serializar payloads
 *   - Iteração de `AsyncIterable` para subscriptions com cancelamento via
 *     `iterator.return()` ao receber `subscription.stop`.
 *
 * O wire protocol (channel, formato de request/response) é idêntico ao do
 * electron-trpc, então o lado renderer (`ipcLink` do electron-trpc@0.7.1)
 * continua funcionando sem modificações.
 */

import {
  getErrorShape,
  getTRPCErrorFromUnknown,
  TRPCError,
  type TRPCError as TRPCErrorType,
  transformTRPCResponse,
} from '@trpc/server';
import type { IpcContext, IpcInvokeEventLike } from './context.ts';
import { appRouter } from './root-router.ts';

export const ELECTRON_TRPC_CHANNEL = 'electron-trpc';

export type ETRPCOperationType = 'query' | 'mutation' | 'subscription';

export type ETRPCRequest =
  | {
      readonly method: 'request';
      readonly operation: {
        readonly id: string | number;
        readonly type: ETRPCOperationType;
        readonly path: string;
        readonly input: unknown;
      };
    }
  | { readonly method: 'subscription.stop'; readonly id: string | number };

export interface IpcReplyEventLike {
  readonly sender: { isDestroyed(): boolean; readonly id?: number };
  reply(channel: string, data: unknown): void;
}

export type CreateIpcContextFn = (event: IpcInvokeEventLike) => Promise<IpcContext>;

type RespondPayload = { id: string | number; result?: unknown; error?: unknown };
type RespondFn = (payload: RespondPayload) => void;

/**
 * Subscriptions ativas por request id — permite `subscription.stop` cancelar
 * a iteração via `iterator.return()`, que dispara o `finally` do async
 * generator e limpa listeners/disposables.
 *
 * Tracking inclui `senderId` (webContents.id) para permitir cleanup
 * em massa quando o renderer recarrega via `did-start-navigation`. Sem isso,
 * subscriptions órfãs continuavam tentando emitir para um sender que já
 * descartou os listeners (electron-trpc client foi remontado), vazando
 * memória + handles na main process.
 */
interface ActiveSubscription {
  readonly stop: () => void;
  readonly senderId: number | undefined;
}
const activeSubscriptions = new Map<string | number, ActiveSubscription>();

/**
 * Cancela todas as subscriptions associadas a um `senderId` (webContents.id).
 * Chamada do `ipc-server` via hook de navigation/destroy do webContents.
 */
export function cleanupSubscriptionsForSender(senderId: number): void {
  for (const [id, entry] of activeSubscriptions) {
    if (entry.senderId === senderId) {
      activeSubscriptions.delete(id);
      entry.stop();
    }
  }
}

export async function handleIpcRequest(
  event: IpcReplyEventLike,
  request: ETRPCRequest,
  createContext: CreateIpcContextFn,
): Promise<void> {
  if (request.method === 'subscription.stop') {
    const entry = activeSubscriptions.get(request.id);
    if (entry) {
      activeSubscriptions.delete(request.id);
      entry.stop();
    }
    return;
  }

  const { id, type, path, input: serializedInput } = request.operation;
  const config = appRouter._def._config;

  const respond: RespondFn = (payload) => {
    if (event.sender.isDestroyed()) return;
    event.reply(
      ELECTRON_TRPC_CHANNEL,
      // biome-ignore lint/suspicious/noExplicitAny: (reason: tRPC v11 internal config + ResolveResponse types não são exportados de @trpc/server; remover quando electron-trpc adicionar suporte v11 nativo)
      transformTRPCResponse(config as unknown as any, payload as unknown as any),
    );
  };

  let ctx: IpcContext | Record<string, never> = {};
  try {
    ctx = await createContext(event as unknown as IpcInvokeEventLike);
  } catch (ctxErr: unknown) {
    const error = getTRPCErrorFromUnknown(ctxErr) as TRPCErrorType;
    respond({
      id,
      error: getErrorShape({
        // biome-ignore lint/suspicious/noExplicitAny: (reason: tRPC v11 internal config type não é exportado; getErrorShape requer este shape — remover quando electron-trpc atualizar para v11)
        config: config as unknown as any,
        error,
        type,
        path,
        input: undefined,
        ctx: {},
      }),
    });
    return;
  }

  try {
    const input: unknown =
      serializedInput === undefined
        ? undefined
        : (config.transformer.input as { deserialize(v: unknown): unknown }).deserialize(
            serializedInput,
          );

    const caller = appRouter.createCaller(ctx as IpcContext);

    let fn: unknown = caller;
    for (const part of path.split('.')) {
      fn = (fn as Record<string, unknown>)[part];
    }

    if (typeof fn !== 'function') {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `No "${type}"-procedure on path "${path}"`,
      });
    }

    const result = await (fn as (x?: unknown) => Promise<unknown>)(input);

    if (type === 'subscription') {
      await streamSubscription(
        id,
        result,
        respond,
        () => event.sender.isDestroyed(),
        event.sender.id,
      );
    } else {
      respond({ id, result: { type: 'data', data: result } });
    }
  } catch (cause: unknown) {
    const error = getTRPCErrorFromUnknown(cause) as TRPCErrorType;
    respond({
      id,
      error: getErrorShape({
        // biome-ignore lint/suspicious/noExplicitAny: (reason: tRPC v11 internal config type não é exportado; getErrorShape requer este shape — remover quando electron-trpc atualizar para v11)
        config: config as unknown as any,
        error,
        type,
        path,
        input: undefined,
        ctx,
      }),
    });
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  );
}

async function streamSubscription(
  id: string | number,
  source: unknown,
  respond: RespondFn,
  isClosed: () => boolean,
  senderId?: number,
): Promise<void> {
  if (!isAsyncIterable(source)) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'subscription resolver did not return an async iterable',
    });
  }

  const iterator = source[Symbol.asyncIterator]();
  let stopped = false;
  const stop = (): void => {
    stopped = true;
    if (typeof iterator.return === 'function') {
      void iterator.return(undefined).catch(() => {
        /* iterator return may throw after already-returned state */
      });
    }
  };
  activeSubscriptions.set(id, { stop, senderId });

  try {
    while (!stopped && !isClosed()) {
      const step = await iterator.next();
      if (step.done) break;
      if (stopped || isClosed()) break;
      respond({ id, result: { type: 'data', data: step.value } });
    }
    if (!isClosed()) {
      respond({ id, result: { type: 'stopped' } });
    }
  } catch (cause: unknown) {
    if (isClosed()) return;
    throw cause;
  } finally {
    activeSubscriptions.delete(id);
    if (typeof iterator.return === 'function' && !stopped) {
      void iterator.return(undefined).catch(() => {
        /* iterator return may throw after already-returned state */
      });
    }
  }
}
