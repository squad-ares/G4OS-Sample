import type { Histogram } from 'prom-client';

export interface HistogramTimer {
  readonly end: (labels?: Record<string, string>) => number;
}

export function startHistogramTimer(
  histogram: Histogram<string>,
  labels: Record<string, string> = {},
): HistogramTimer {
  const startNs = process.hrtime.bigint();
  return {
    end: (extraLabels: Record<string, string> = {}) => {
      const elapsedNs = Number(process.hrtime.bigint() - startNs);
      const elapsedSeconds = elapsedNs / 1_000_000_000;
      histogram.labels({ ...labels, ...extraLabels }).observe(elapsedSeconds);
      return elapsedSeconds;
    },
  };
}
