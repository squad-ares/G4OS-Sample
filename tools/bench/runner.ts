#!/usr/bin/env tsx
/**
 * Bench suite runner — entry point invocado por `pnpm bench:all`.
 *
 * Estado: scaffold. Cada bench helper (`benchStartup`, `benchRoundtrip`,
 * `benchMemory`) ainda é stub que retorna shape vazio até Playwright +
 * dist/ build estarem disponíveis no runner CI.
 *
 * Output: `tools/bench/bench-results.json` consumido por `check-regression.ts`.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type MetricSummary, summarize } from './percentile.ts';

interface BenchResults {
  readonly _meta: {
    readonly runAt: string;
    readonly node: string;
    readonly stub: boolean;
  };
  readonly [metric: string]: unknown;
}

async function benchStartup(): Promise<MetricSummary> {
  // TODO promote: substituir stub por Playwright launch loop.
  // for (let i = 0; i < 20; i++) {
  //   const t0 = performance.now();
  //   const app = await electron.launch({ args: ['./dist/main/index.js'] });
  //   const page = await app.firstWindow();
  //   await page.waitForSelector('[data-testid="ready"]');
  //   metrics.push(performance.now() - t0);
  //   await app.close();
  // }
  return summarize([]);
}

async function benchWarmStart(): Promise<MetricSummary> {
  return summarize([]);
}

async function benchRoundtrip(): Promise<MetricSummary> {
  return summarize([]);
}

async function benchSessionSwitch(): Promise<MetricSummary> {
  return summarize([]);
}

async function benchSourceMount(): Promise<MetricSummary> {
  return summarize([]);
}

async function benchMemory(): Promise<{
  readonly idle: { readonly residentMB: number };
  readonly tenSessions: { readonly residentMB: number };
}> {
  return { idle: { residentMB: 0 }, tenSessions: { residentMB: 0 } };
}

async function main(): Promise<void> {
  const startup = await benchStartup();
  const warmStart = await benchWarmStart();
  const firstMessage = await benchRoundtrip();
  const sessionSwitch = await benchSessionSwitch();
  const sourceMount = await benchSourceMount();
  const memory = await benchMemory();

  const results: BenchResults = {
    _meta: {
      runAt: new Date().toISOString(),
      node: process.version,
      // Stub flag sinaliza pro check-regression que o run não é confiável
      // ainda — comparação contra baseline real não faz sentido até promote.
      stub: true,
    },
    startup,
    warm_start: warmStart,
    first_message: firstMessage,
    session_switch: sessionSwitch,
    source_mount: sourceMount,
    memory_idle: { residentMB: memory.idle.residentMB },
    memory_10sessions: { residentMB: memory.tenSessions.residentMB },
  };

  const outPath = join('tools', 'bench', 'bench-results.json');
  writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`[OK] bench results written to ${outPath} (stub: true)`);
}

void main().catch((cause: unknown) => {
  console.error(cause);
  process.exit(1);
});
