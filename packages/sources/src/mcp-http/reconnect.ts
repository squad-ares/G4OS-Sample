import { type IDisposable, toDisposable } from '@g4os/kernel/disposable';
import { skip } from 'rxjs';
import type { McpHttpSource } from './source.ts';

export interface ReconnectOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly now?: () => number;
  readonly setTimer?: (fn: () => void, ms: number) => { cancel: () => void };
}

/**
 * Watch source status and auto-reconnect with exponential backoff.
 * - Reconnect only for 'disconnected' and 'error' states.
 * - 'needs_auth' is NOT auto-retried (caller must run OAuth).
 * - Resets attempt counter on 'connected'.
 */
export function withReconnect(source: McpHttpSource, options: ReconnectOptions = {}): IDisposable {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const setTimer =
    options.setTimer ??
    ((fn, ms) => {
      const h = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(h) };
    });

  let attempts = 0;
  let pending: { cancel: () => void } | null = null;
  let disposed = false;

  const subscription = source.status$.pipe(skip(1)).subscribe((status) => {
    if (disposed) return;
    if (status === 'connected') {
      attempts = 0;
      pending?.cancel();
      pending = null;
      return;
    }
    if (status === 'disconnected' || status === 'error') {
      if (attempts >= maxAttempts) return;
      if (pending) return;
      attempts += 1;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempts - 1));
      pending = setTimer(() => {
        pending = null;
        if (!disposed) void source.activate();
      }, delay);
    }
  });

  return toDisposable(() => {
    disposed = true;
    pending?.cancel();
    subscription.unsubscribe();
  });
}
