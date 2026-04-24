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

test('login screen is reachable from a fresh user data dir', async () => {
  launched = await launchApp();
  // Título da tela de login — pt-BR: "Entrar no G4 OS",
  // en-US: "Sign in to G4 OS". Ambos contêm "G4 OS".
  // Pode demorar até o renderer hidratar auth state + navegar para /login.
  const loginTitle = launched.window.getByText(/(Sign in to|Entrar no) G4 OS/);
  await expect(loginTitle).toBeVisible({ timeout: 20_000 });
});
