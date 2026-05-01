#!/usr/bin/env tsx
/**
 * Bench gate: compara `bench-results.json` (output da última run) contra
 * `baseline.json` (versão commitada). Falha se p95 regrediu mais de N%
 * em qualquer métrica.
 *
 * Uso: `pnpm bench:check [--max-regression 0.10]`. Default 10%. Reduzir
 * threshold quando time decidir apertar a budget; subir só com PR
 * dedicado + nota no message.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface BenchSection {
  readonly p95?: number;
  readonly residentMB?: number;
}

type BenchResults = Readonly<Record<string, BenchSection>>;

const args = process.argv.slice(2);
const maxRegressionFlag = args.indexOf('--max-regression');
const maxRegression = maxRegressionFlag >= 0 ? Number(args[maxRegressionFlag + 1] ?? '0.10') : 0.1;

if (Number.isNaN(maxRegression) || maxRegression <= 0 || maxRegression > 1) {
  console.error(`invalid --max-regression: ${maxRegression} (expected 0 < x <= 1)`);
  process.exit(2);
}

const baselinePath = join('tools', 'bench', 'baseline.json');
const resultsPath = join('tools', 'bench', 'bench-results.json');

let baseline: BenchResults;
let current: BenchResults;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as BenchResults;
} catch (cause) {
  console.error(`cannot read baseline at ${baselinePath}: ${(cause as Error).message}`);
  process.exit(2);
}
try {
  current = JSON.parse(readFileSync(resultsPath, 'utf-8')) as BenchResults;
} catch (cause) {
  console.error(`cannot read current results at ${resultsPath}: ${(cause as Error).message}`);
  console.error('did you run `pnpm bench:all` first?');
  process.exit(2);
}

let failed = false;

for (const [metric, baseSection] of Object.entries(baseline)) {
  const curSection = current[metric];
  if (!curSection) {
    console.error(`metric "${metric}" missing from current run`);
    failed = true;
    continue;
  }

  for (const key of ['p95', 'residentMB'] as const) {
    const baseVal = baseSection[key];
    const curVal = curSection[key];
    if (baseVal === undefined || curVal === undefined) continue;
    if (curVal > baseVal * (1 + maxRegression)) {
      const pctDelta = ((curVal / baseVal - 1) * 100).toFixed(1);
      console.error(
        `[REGRESSION] ${metric}.${key}: ${baseVal} → ${curVal} (+${pctDelta}% > ${(maxRegression * 100).toFixed(0)}%)`,
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(
  `[OK] all metrics within ${(maxRegression * 100).toFixed(0)}% of baseline (${Object.keys(baseline).length} compared)`,
);
