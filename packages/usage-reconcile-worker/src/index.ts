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
 *
 * Rastreado em: TASK-18-07 (`STUDY/Audit/Tasks/18-v1-parity-gaps/`).
 * Doc de deferral: `docs/deferred/usage-reconcile-worker.md`.
 */

import { AppError, ErrorCode, type IDisposable, type Result } from '@g4os/kernel';
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
   *
   * F-CR50-5: tipo explícito `number | undefined` (não `?`) para compatibilidade
   * com `exactOptionalPropertyTypes` (ADR-0002). `{ x?: T }` não aceita
   * `{ x: undefined }` em strict mode — causa armadilha silenciosa ao
   * fazer spread com valor undefined.
   */
  readonly divergenceToleranceP: number | undefined;
  /**
   * Checkpoint persistido — lido no início pra saber a última window
   * reconciliada com sucesso; escrito após cada `postReconciliation` ok.
   * F-CR50-6: sem checkpoint, restart duplica toda a history ou perde windows.
   */
  readonly checkpoint: CheckpointPort;
}

export interface BillingPort {
  /**
   * F-CR50-2: `signal` propaga AbortSignal do worker handle — permite
   * cancelar requests HTTP em voo durante graceful shutdown (ADR-0032).
   */
  fetchUsageWindow(opts: {
    readonly fromMs: number;
    readonly toMs: number;
    readonly signal?: AbortSignal;
  }): Promise<Result<readonly UsageRecord[], AppError>>;

  /**
   * F-CR50-1: `idempotencyKey` derivado deterministicamente da window +
   * tenant. Backend deve deduplicar por essa chave (UNIQUE constraint ou
   * cache TTL). Retry após timeout de rede não grava duas vezes.
   *
   * F-CR50-2: `signal` propaga AbortSignal para cancelar em shutdown.
   */
  postReconciliation(
    records: readonly ReconciliationRecord[],
    opts: {
      readonly idempotencyKey: string;
      readonly signal?: AbortSignal;
    },
  ): Promise<Result<void, AppError>>;
}

export interface LocalUsagePort {
  /**
   * F-CR50-2: `signal` propaga AbortSignal para cancelar leitura local
   * em shutdown (pode envolver IO de banco).
   */
  fetchUsageWindow(opts: {
    readonly fromMs: number;
    readonly toMs: number;
    readonly signal?: AbortSignal;
  }): Promise<Result<readonly UsageRecord[], AppError>>;
}

/**
 * F-CR50-6: porta de checkpoint persistido entre restarts.
 * Invariante: write ocorre APÓS `postReconciliation` retornar `ok` —
 * falha entre as duas é idempotente via `idempotencyKey` (F-CR50-1).
 */
export interface CheckpointPort {
  read(): Promise<Result<{ readonly lastReconciledToMs: number } | null, AppError>>;
  write(toMs: number): Promise<Result<void, AppError>>;
}

export interface UsageRecord {
  readonly timestampMs: number;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /**
   * F-CR50-7: campo PII — jamais logar diretamente. Passar já hasheado
   * (SHA-256) pelo caller antes de atribuir; nunca repassar para logger
   * ou breadcrumb Sentry sem scrub (ADR-0062).
   *
   * @pii hash-before-assignment
   */
  readonly userIdHash?: string;
}

export interface ReconciliationRecord {
  readonly windowFromMs: number;
  readonly windowToMs: number;
  readonly localTotalTokens: number;
  readonly billingTotalTokens: number;
  readonly divergencePp: number;
  readonly status: 'reconciled' | 'tolerance_exceeded' | 'no_data';
}

/**
 * F-CR50-3: handle estende `IDisposable` para compor com `DisposableStore`
 * e `bindToAbort` (ADR-0012). Impl real usa `extends DisposableBase` +
 * `this._register(toDisposable(() => clearInterval(timer)))`.
 * `dispose()` é equivalente ao antigo `stop()` — síncrono para compor
 * com DisposableStore; `stop()` permanece para callers que precisam
 * aguardar limpeza assíncrona.
 */
export interface UsageReconcileWorkerHandle extends IDisposable {
  start(): Promise<Result<void, AppError>>;
  /** Aguarda término do ciclo em andamento e libera recursos. */
  stop(): Promise<void>;
  /** Trigger manual de um ciclo (debug/test). */
  runOnce(): Promise<Result<readonly ReconciliationRecord[], AppError>>;
}

export function createUsageReconcileWorker(
  _options: UsageReconcileWorkerOptions,
): UsageReconcileWorkerHandle {
  // F-CR50-4: FEATURE_DISABLED discrimina "feature gated / skeleton" de
  // UNKNOWN_ERROR (bug inesperado). Caller pode exibir "Habilite billing
  // nas configurações" sem disparar Sentry (ADR-0011).
  const skeletonError = new AppError({
    code: ErrorCode.FEATURE_DISABLED,
    message:
      'usage-reconcile-worker: skeleton — implementação real depende de backend de billing existir',
  });

  return {
    start: () => Promise.resolve(err(skeletonError)),
    stop: () => Promise.resolve(),
    // F-CR50-3: dispose síncrono para compatibilidade com DisposableStore.
    dispose: () => {
      /* noop no skeleton — impl real limpa timer + AbortController */
    },
    runOnce: () =>
      Promise.resolve(
        err(
          new AppError({
            code: ErrorCode.FEATURE_DISABLED,
            message: 'usage-reconcile-worker: skeleton',
          }),
        ),
      ),
  };
}
