/**
 * Sessions router — subscriptions de eventos (persisted + transient).
 * Padrão async-generator do tRPC v11 com fila in-memory + signal abort.
 */

import { SessionIdSchema } from '@g4os/kernel/schemas';
import type { SessionEvent, TurnStreamEvent } from '@g4os/kernel/types';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

// Limite de queue por subscription pra evitar OOM em backpressure
// (renderer lento, hung, ou processando). Quando excede, drop oldest.
const MAX_SUBSCRIPTION_QUEUE = 100;

export const sessionsSubscriptionsRouter = router({
  /**
   * Subscription de eventos persistidos (lifecycle, message_added, etc.).
   * Backpressure via fila in-memory; espera consciente do signal resolve
   * quando novo evento chega OU cliente desconecta.
   */
  stream: authed.input(z.object({ sessionId: SessionIdSchema })).subscription(async function* ({
    input,
    ctx,
    signal,
  }) {
    const queue: SessionEvent[] = [];
    let notify: (() => void) | null = null;

    const disposable = ctx.sessions.subscribe(input.sessionId, (event) => {
      // Cap em queue pra evitar OOM se renderer está lento.
      // Drop oldest se exceder — eventos perdidos são preferível a memória
      // sem limite. Cap conservador (100 eventos cobre 5-10s de tool loop).
      if (queue.length >= MAX_SUBSCRIPTION_QUEUE) {
        queue.shift();
      }
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

  /**
   * Subscription de eventos transientes de turn (text/thinking chunks,
   * tool_use_*, done, error). Renderer usa para mostrar texto em tempo
   * real antes da mensagem ser persistida.
   */
  turnStream: authed.input(z.object({ sessionId: SessionIdSchema })).subscription(async function* ({
    input,
    ctx,
    signal,
  }) {
    const queue: TurnStreamEvent[] = [];
    let notify: (() => void) | null = null;

    const disposable = ctx.sessions.subscribeStream(input.sessionId, (event) => {
      // Idem stream — drop oldest em backpressure.
      if (queue.length >= MAX_SUBSCRIPTION_QUEUE) {
        queue.shift();
      }
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
});
