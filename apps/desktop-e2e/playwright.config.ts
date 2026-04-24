/**
 * Playwright config para smoke tests E2E do desktop (OUTLIER-23 MVP).
 *
 * Estratégia: rodar local com `pnpm --filter @g4os/desktop-e2e test:e2e`
 * após `pnpm --filter @g4os/desktop build` (ou em dev com electron-vite).
 * CI nightly expand depois — começamos com smoke que valida launch + UI.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // biome-ignore lint/style/noProcessEnv: Playwright config runs outside app runtime; CI env flag selects GitHub vs list reporter — sanctioned read at test-harness boundary
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-electron',
      testMatch: /.*\.e2e\.ts$/,
    },
  ],
});
