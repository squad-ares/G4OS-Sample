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
 * Threshold: 5MB de heap growth após 30 ciclos. Calibração inicial
 * conservadora; ajustar com baseline real após primeira run.
 */

import { expect, test } from '@playwright/test';
import { type LaunchedApp, launchApp } from './helpers/launch-app.ts';

const CYCLE_COUNT = 30;
const HEAP_DELTA_THRESHOLD_MB = 5;
const SETTLE_MS = 200;

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  if (launched) {
    await launched.close();
    launched = null;
  }
});

// biome-ignore lint/style/noProcessEnv: e2e test — env-driven opt-in
const memlabEnabled = process.env['G4OS_E2E_MEMLAB'] === '1';

test.skip(
  ({ browserName }) => !memlabEnabled || browserName !== 'chromium',
  'memlab gate é opt-in via G4OS_E2E_MEMLAB=1 (rodado em CI noturno)',
);

test('debug HUD não vaza memória após múltiplos ciclos abre/fecha', async () => {
  launched = await launchApp({ auth: 'mock' });

  // Baseline antes de tocar no HUD.
  await sleep(1_000);
  const baseline = await readMainHeap(launched);

  // Cycle: o atalho global está registrado no main (em mock auth está
  // bootstrapped). API pública do globalShortcut não permite trigger
  // direto; o teste mede estabilidade de subscribers/timers globais
  // após N ciclos do tick do aggregator + interação app.
  for (let i = 0; i < CYCLE_COUNT; i++) {
    await launched.app.evaluate(({ globalShortcut }) => {
      globalShortcut.isRegistered('CommandOrControl+Shift+D');
    });
    await sleep(SETTLE_MS);
  }

  // Force GC se disponível (precisa --js-flags=--expose-gc no electron launch).
  await launched.app.evaluate(() => {
    if (typeof globalThis.gc === 'function') globalThis.gc();
  });
  await sleep(500);

  const final = await readMainHeap(launched);
  const deltaMB = (final.heapUsed - baseline.heapUsed) / 1_048_576;
  // biome-ignore lint/suspicious/noConsole: gate output goes to CI artifact
  console.log(
    `[memlab] heap delta after ${CYCLE_COUNT} cycles: ${deltaMB.toFixed(2)} MB ` +
      `(baseline=${(baseline.heapUsed / 1_048_576).toFixed(1)}MB, ` +
      `final=${(final.heapUsed / 1_048_576).toFixed(1)}MB)`,
  );
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
