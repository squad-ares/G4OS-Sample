/**
 * `@g4os/usage-reconcile-worker` — worker que reconcilia tokens consumidos
 * (capturados via `g4os_turn_tokens_total` + `usage` events do agent) vs.
 * billing/quota do backend de cobrança (Stripe, custom, etc.).
 *
 * Estado: skeleton. Define o contrato + ports. Implementação real é
 * gated por:
 *
 * 1. Backend de billing existir (multi-user/SaaS roadmap, não MVP single-user).
 * 2. Decisão sobre frequência de reconcile (real-time? batch noturno? cobrança
 *    em hold por 24h?).
 * 3. Política de divergência (cliente reportou 1000 tokens, backend recebeu
 *    980 — quem ganha? overshoot tolerance?).
 *
 * Por que skeleton: V2 MVP é single-user device-only. Tokens são contados
 * localmente pra observabilidade (metric `turn.tokens.total`), não pra
 * cobrança. Worker só faz sentido quando billing entrar — se entrar.
 */

import { AppError, ErrorCode, type Result } from '@g4os/kernel/errors';
import { err } from 'neverthrow';

export interface UsageReconcileWorkerOptions {
  /** Período entre reconcile cycles (ms). Default 1h em prod. */
  readonly intervalMs: number;
  /** Cliente do backend de billing — injetado pra testabilidade. */
  readonly billingClient: BillingPort;
  /** Source-of-truth local — eventos `usage` do session event store. */
  readonly localUsage: LocalUsagePort;
  /**
   * Tolerância de divergência em pp. Default 5% — fora disso, abre
   * incident em vez de auto-cobrar.
   */
  readonly divergenceToleranceP?: number;
}

export interface BillingPort {
  fetchUsageWindow(opts: {
    readonly fromMs: number;
    readonly toMs: number;
  }): Promise<Result<readonly UsageRecord[], AppError>>;
  postReconciliation(records: readonly ReconciliationRecord[]): Promise<Result<void, AppError>>;
}

export interface LocalUsagePort {
  fetchUsageWindow(opts: {
    readonly fromMs: number;
    readonly toMs: number;
  }): Promise<Result<readonly UsageRecord[], AppError>>;
}

export interface UsageRecord {
  readonly timestampMs: number;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly userId?: string;
}

export interface ReconciliationRecord {
  readonly windowFromMs: number;
  readonly windowToMs: number;
  readonly localTotalTokens: number;
  readonly billingTotalTokens: number;
  readonly divergencePp: number;
  readonly status: 'reconciled' | 'tolerance_exceeded' | 'no_data';
}

export interface UsageReconcileWorkerHandle {
  start(): Promise<Result<void, AppError>>;
  stop(): Promise<void>;
  /** Trigger manual de um ciclo (debug/test). */
  runOnce(): Promise<Result<readonly ReconciliationRecord[], AppError>>;
}

export function createUsageReconcileWorker(
  _options: UsageReconcileWorkerOptions,
): UsageReconcileWorkerHandle {
  return {
    start: () =>
      Promise.resolve(
        err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message:
              'usage-reconcile-worker: skeleton — implementação real depende de backend de billing existir',
          }),
        ),
      ),
    stop: () => Promise.resolve(),
    runOnce: () =>
      Promise.resolve(
        err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'usage-reconcile-worker: skeleton',
          }),
        ),
      ),
  };
}
