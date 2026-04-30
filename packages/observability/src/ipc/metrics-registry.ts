/**
 * `IpcMetricsRegistry` — singleton de telemetria de tRPC procedures
 * para o Debug HUD.
 *
 * Padrão idêntico ao `logStream` do kernel: middleware push,
 * aggregator pull, fast path quando ninguém pediu snapshot recente.
 *
 * Janela rolling de 60s. Cada `record(sample)` agrega em O(1) numa
 * lista; `snapshot()` calcula percentis e drop expirados. Truncamento
 * acontece em snapshot — não pollute o hot path do middleware.
 *
 * Por que singleton (não injection): o middleware tRPC é definido em
 * module-level via `middleware(async ({...}) => ...)`. Não há ctx para
 * injetar. Singleton é o padrão idiomático aqui — mesmo motivo de
 * `logStream` ser singleton.
 */

export interface IpcSample {
  /** Timestamp ms epoch quando a procedure terminou. */
  readonly ts: number;
  /** Path do procedure no router (`auth.getMe`, `sessions.create`, …). */
  readonly path: string;
  /** Tipo do procedure tRPC. */
  readonly type: 'query' | 'mutation' | 'subscription';
  /** Duração ponta-a-ponta em ms (incluindo middleware acima dele). */
  readonly durationMs: number;
  /** `true` se procedure resolveu OK; `false` se rejeitou. */
  readonly ok: boolean;
}

export interface IpcPathStats {
  readonly path: string;
  readonly count: number;
  readonly errors: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
}

export interface IpcSnapshot {
  /** Total de samples na janela 60s. */
  readonly totalCount: number;
  /** Requests por segundo (totalCount / 60). */
  readonly reqPerSec: number;
  /** Total de erros na janela. */
  readonly errorCount: number;
  /** errorCount / totalCount, ou 0 se totalCount=0. */
  readonly errorRate: number;
  /** Percentil 50 da duração em ms (todos os paths). */
  readonly p50Ms: number;
  /** Percentil 95 da duração em ms. */
  readonly p95Ms: number;
  /** Top paths por count desc, max 5. */
  readonly topPaths: readonly IpcPathStats[];
}

const WINDOW_MS = 60_000;
const TOP_PATHS_MAX = 5;

const EMPTY_SNAPSHOT: IpcSnapshot = {
  totalCount: 0,
  reqPerSec: 0,
  errorCount: 0,
  errorRate: 0,
  p50Ms: 0,
  p95Ms: 0,
  topPaths: [],
};

class IpcMetricsRegistry {
  /**
   * Buffer ordenado cronologicamente. `record` faz push (O(1));
   * `snapshot` faz shift (O(amortized)) para limpar expirados.
   */
  private samples: IpcSample[] = [];
  /**
   * Quando ninguém pediu snapshot recentemente o buffer pode crescer
   * sem cleanup. Cap defensivo evita explosão se aggregator estiver
   * desligado e middleware continuar gravando.
   */
  private static readonly MAX_BUFFER_LEN = 50_000;

  record(sample: IpcSample): void {
    if (this.samples.length >= IpcMetricsRegistry.MAX_BUFFER_LEN) {
      // Drop oldest em batch para evitar shift O(n) por insert.
      this.samples.splice(0, IpcMetricsRegistry.MAX_BUFFER_LEN / 2);
    }
    this.samples.push(sample);
  }

  snapshot(now: number = Date.now()): IpcSnapshot {
    const cutoff = now - WINDOW_MS;
    while (this.samples.length > 0 && (this.samples[0]?.ts ?? 0) < cutoff) {
      this.samples.shift();
    }
    if (this.samples.length === 0) return EMPTY_SNAPSHOT;

    const totalCount = this.samples.length;
    let errorCount = 0;
    const allDurations: number[] = [];
    const byPath = new Map<string, { count: number; errors: number; durations: number[] }>();
    for (const s of this.samples) {
      allDurations.push(s.durationMs);
      if (!s.ok) errorCount += 1;
      let stats = byPath.get(s.path);
      if (!stats) {
        stats = { count: 0, errors: 0, durations: [] };
        byPath.set(s.path, stats);
      }
      stats.count += 1;
      if (!s.ok) stats.errors += 1;
      stats.durations.push(s.durationMs);
    }

    allDurations.sort((a, b) => a - b);
    const p50Ms = percentile(allDurations, 0.5);
    const p95Ms = percentile(allDurations, 0.95);

    const topPaths: IpcPathStats[] = Array.from(byPath.entries())
      .map(([path, stats]) => {
        const sorted = [...stats.durations].sort((a, b) => a - b);
        return {
          path,
          count: stats.count,
          errors: stats.errors,
          p50Ms: percentile(sorted, 0.5),
          p95Ms: percentile(sorted, 0.95),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_PATHS_MAX);

    return {
      totalCount,
      reqPerSec: totalCount / 60,
      errorCount,
      errorRate: errorCount / totalCount,
      p50Ms,
      p95Ms,
      topPaths,
    };
  }

  /** Reset usado em testes. */
  clear(): void {
    this.samples = [];
  }
}

export const ipcMetrics = new IpcMetricsRegistry();

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  // Nearest-rank simples; suficiente para painel HUD (não estatística rigorosa).
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}
