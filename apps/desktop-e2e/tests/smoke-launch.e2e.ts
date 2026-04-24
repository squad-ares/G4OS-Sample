/**
 * OUTLIER-23 MVP smoke: valida que o Electron main inicia, abre uma janela
 * e expõe o title esperado. Não entra em fluxo autenticado — o flow completo
 * (login → workspace → session → send) fica para a Phase 2 quando tivermos
 * mock de Supabase + API keys em CI (ADR pendente).
 */

import { expect, test } from '@playwright/test';
import { type LaunchedApp, launchApp } from './helpers/launch-app.ts';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  if (launched) {
    await launched.close();
    launched = null;
  }
});

test('app launches and opens a window', async () => {
  launched = await launchApp();
  const title = await launched.window.title();
  // App title deve conter "G4 OS" (padrão do flavor interno / public).
  expect(title).toMatch(/G4 OS/);
});

test('main window renders the shell sidebar', async () => {
  launched = await launchApp();
  // Sidebar de navegação tem aria-label canônico definido em
  // `shell.sidebar.ariaLabel` (pt-BR: "Trilho de atividades",
  // en-US: "Activity rail"). Ambos contêm "ativid" ou "activ".
  const sidebar = launched.window.locator('[aria-label*="ctivit" i], [aria-label*="ctivid" i]');
  await expect(sidebar).toBeVisible({ timeout: 15_000 });
});
