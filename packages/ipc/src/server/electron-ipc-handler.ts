/**
 * Substitui o `createIPCHandler` do electron-trpc@0.7.1 no processo main.
 *
 * electron-trpc@0.7.1 foi escrito para tRPC v10 e não funciona com tRPC v11:
 *   1. Usa `i(n)` para chamar procedimentos — que em v11 lança
 *      "This is a client-only function".
 *   2. Tenta chamar `router.getErrorShape(...)` — que não existe em v11.
 *   3. Como resultado, toda query de IPC fica pendente para sempre, porque
 *      `event.reply` nunca é chamado.
 *
 * Esta implementação usa as APIs corretas do tRPC v11:
 *   - `appRouter.createCaller(ctx)` para invocar procedimentos
 *   - `getErrorShape` standalone para formatar erros
 *   - `transformTRPCResponse` para serializar payloads
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
  readonly sender: { isDestroyed(): boolean };
  reply(channel: string, data: unknown): void;
}

export type CreateIpcContextFn = (event: IpcInvokeEventLike) => Promise<IpcContext>;

export async function handleIpcRequest(
  event: IpcReplyEventLike,
  request: ETRPCRequest,
  createContext: CreateIpcContextFn,
): Promise<void> {
  if (request.method === 'subscription.stop') return;

  const { id, type, path, input: serializedInput } = request.operation;
  const config = appRouter._def._config;

  const respond = (payload: { id: typeof id; result?: unknown; error?: unknown }): void => {
    if (event.sender.isDestroyed()) return;
    event.reply(
      ELECTRON_TRPC_CHANNEL,
      // biome-ignore lint/suspicious/noExplicitAny: tRPC internal response type
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
        // biome-ignore lint/suspicious/noExplicitAny: tRPC internal config type
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
    respond({ id, result: { type: 'data', data: result } });
  } catch (cause: unknown) {
    const error = getTRPCErrorFromUnknown(cause) as TRPCErrorType;
    respond({
      id,
      error: getErrorShape({
        // biome-ignore lint/suspicious/noExplicitAny: tRPC internal config type
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
