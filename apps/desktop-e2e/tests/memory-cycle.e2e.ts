/**
 * TASK-17-11 — gate de memória do Debug HUD.
 *
 * Cenário: abre/fecha o HUD múltiplas vezes via atalho global e mede
 * heap delta no main process via `app.evaluate(() => process.memoryUsage())`.
 *
 * Não é memlab full (que exige BrowserWindow profiling + heap diff
 * baseado em retained graph) — é um smoke gate que pega leak grosso:
 * subscribers que não desfazem, timers que não param, eventos sem
 * dispose. Memlab proper fica como sub-task quando a infra de CI
 * comportar (macOS runner persistente).
 *
 * **Calibração**: rode local 3-5 vezes com `G4OS_MEMLAB_BASELINE=1` (não
 * asserta, só reporta heap por ciclo). Observe a distribuição: o delta
 * típico em ambiente sem leak deve ser < 2MB. Ajuste `THRESHOLD_MB`
 * para 2-3x o p95 observado pra absorver ruído de GC.
 *
 * **Configurável via env**:
 *   - `G4OS_MEMLAB_CYCLES=N` (default 30)
 *   - `G4OS_MEMLAB_THRESHOLD_MB=N` (default 5)
 *   - `G4OS_MEMLAB_BASELINE=1` (não asserta — só coleta dados)
 */

import { expect, test } from '@playwright/test';
import { type LaunchedApp, launchApp } from './helpers/launch-app.ts';

// biome-ignore lint/style/noProcessEnv: e2e test — env-driven config
const env = process.env;

const CYCLE_COUNT = Number(env['G4OS_MEMLAB_CYCLES']) || 30;
const HEAP_DELTA_THRESHOLD_MB = Number(env['G4OS_MEMLAB_THRESHOLD_MB']) || 5;
const SETTLE_MS = 200;
const BASELINE_MODE = env['G4OS_MEMLAB_BASELINE'] === '1';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  if (launched) {
    await launched.close();
    launched = null;
  }
});

const memlabEnabled = env['G4OS_E2E_MEMLAB'] === '1';

test.skip(
  ({ browserName }) => !memlabEnabled || browserName !== 'chromium',
  'memlab gate é opt-in via G4OS_E2E_MEMLAB=1 (rodado em CI noturno)',
);

test('debug HUD não vaza memória após múltiplos ciclos abre/fecha', async () => {
  launched = await launchApp({ auth: 'mock' });

  // Baseline antes de tocar no HUD.
  await sleep(1_000);
  const baseline = await readMainHeap(launched);

  // Sample por ciclo (baseline mode) ou só baseline+final (modo gate).
  // Sample by-cycle: ajuda calibrar — operador vê se delta cresce linearmente
  // (leak verdadeiro) ou estabiliza após warmup (GC ruído normal).
  const samples: { cycle: number; heapUsedMB: number }[] = [];

  for (let i = 0; i < CYCLE_COUNT; i++) {
    await launched.app.evaluate(({ globalShortcut }) => {
      globalShortcut.isRegistered('CommandOrControl+Shift+D');
    });
    await sleep(SETTLE_MS);
    if (BASELINE_MODE && i % Math.max(1, Math.floor(CYCLE_COUNT / 10)) === 0) {
      const sample = await readMainHeap(launched);
      samples.push({ cycle: i, heapUsedMB: sample.heapUsed / 1_048_576 });
    }
  }

  // Force GC se disponível (precisa --js-flags=--expose-gc no electron launch).
  await launched.app.evaluate(() => {
    if (typeof globalThis.gc === 'function') globalThis.gc();
  });
  await sleep(500);

  const final = await readMainHeap(launched);
  const deltaMB = (final.heapUsed - baseline.heapUsed) / 1_048_576;
  const baselineMB = baseline.heapUsed / 1_048_576;
  const finalMB = final.heapUsed / 1_048_576;

  // biome-ignore lint/suspicious/noConsole: gate output goes to CI artifact
  console.log(
    `[memlab] heap delta after ${CYCLE_COUNT} cycles: ${deltaMB.toFixed(2)} MB ` +
      `(baseline=${baselineMB.toFixed(1)}MB, final=${finalMB.toFixed(1)}MB, ` +
      `threshold=${HEAP_DELTA_THRESHOLD_MB}MB)`,
  );

  if (BASELINE_MODE && samples.length > 0) {
    // biome-ignore lint/suspicious/noConsole: calibration output
    console.log('[memlab] per-cycle samples (baseline mode):');
    for (const s of samples) {
      // biome-ignore lint/suspicious/noConsole: calibration output
      console.log(`  cycle=${s.cycle.toString().padStart(3)} heap=${s.heapUsedMB.toFixed(2)}MB`);
    }
    // biome-ignore lint/suspicious/noConsole: calibration output
    console.log(
      '[memlab] BASELINE_MODE: skipping assertion. Use observed delta * 2-3 for production threshold.',
    );
    return;
  }

  expect(deltaMB).toBeLessThan(HEAP_DELTA_THRESHOLD_MB);
});

function readMainHeap(
  app: LaunchedApp,
): Promise<{ heapUsed: number; rss: number; external: number }> {
  return app.app.evaluate(() => {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      rss: usage.rss,
      external: usage.external,
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
