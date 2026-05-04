/**
 * Middleware tRPC que captura sample de cada procedure call (path, type,
 * durationMs, ok) e envia para um recorder injetado no boot.
 *
 * Pattern: o middleware é definido em module level e não conhece o
 * sink — o caller (composition root no desktop) chama
 * `setIpcMetricsRecorder(cb)` no boot apontando para o
 * `IpcMetricsRegistry` real (`@g4os/observability/ipc`). Mantém
 * `@g4os/ipc` desacoplado de observability sem ciclo de deps.
 *
 * Quando recorder não é setado (E2E, scaffolds), middleware vira no-op
 * — `next()` direto sem custo extra.
 */

import { middleware } from '../trpc-base.ts';

export interface IpcMetricsSample {
  readonly ts: number;
  readonly path: string;
  readonly type: 'query' | 'mutation' | 'subscription';
  readonly durationMs: number;
  readonly ok: boolean;
}

export type IpcMetricsRecorder = (sample: IpcMetricsSample) => void;

let recorder: IpcMetricsRecorder | null = null;

export function setIpcMetricsRecorder(cb: IpcMetricsRecorder | null): void {
  recorder = cb;
}

export const withMetrics = middleware(async ({ path, type, next }) => {
  if (recorder === null) return next();
  const start = performance.now();
  // try/finally garante que sample é registrado mesmo quando a procedure
  // lança (TRPCError, throw result.error). Sem isso, erros em massa
  // (rate limit, auth fail) somem das métricas — duration e ok-rate
  // ficam sistematicamente subestimados (F-CR38-4, ADR-0064).
  let result: Awaited<ReturnType<typeof next>>;
  let ok = false;
  try {
    result = await next();
    ok = result.ok;
    return result;
  } finally {
    recorder({
      ts: Date.now(),
      path,
      type,
      durationMs: performance.now() - start,
      ok,
    });
  }
});
