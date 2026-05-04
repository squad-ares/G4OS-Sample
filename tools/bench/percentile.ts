/**
 * Helper compartilhado pelos bench files. Calcula percentil sem dep
 * externa (`d3-array` ou similar) — implementação simples baseada em
 * sort + interpolação linear, suficiente pra amostras pequenas (≤100).
 */

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  if (p < 0 || p > 100) {
    throw new RangeError(`percentile p out of range: ${p} (expected 0-100)`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  const w = idx - lo;
  const lower = sorted[lo] ?? 0;
  const upper = sorted[hi] ?? 0;
  return lower * (1 - w) + upper * w;
}

export interface MetricSummary {
  readonly samples: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export function summarize(values: readonly number[]): MetricSummary {
  return {
    samples: values.length,
    min: values.length === 0 ? 0 : Math.min(...values),
    max: values.length === 0 ? 0 : Math.max(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  };
}
