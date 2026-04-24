/**
 * OUTLIER-23 Phase 2 — MVP slice: smokes autenticados via mocks.
 *
 * Usa `launchApp({ auth: 'mock' })` para setar `G4OS_E2E=1` no processo main,
 * o que ativa em `apps/desktop/src/main`:
 *   - `mockAuthMode` em `createAuthRuntime` (pré-seed tokens → sessão restaurada
 *     automaticamente no boot, sem Supabase)
 *   - `createStubAgentFactory()` registrado no `AgentRegistry` (primeiro match
 *     em qualquer config → stub agente que ecoa a mensagem do user)
 *
 * Cobertura Phase 2 entregue aqui:
 *   1. `authenticated shell does not show login title`
 *   2. `activity rail is visible (same as unauthenticated smoke, proves boot)`
 *
 * Flows mais profundos (criar sessão via UI + send + aguardar reply renderizar)
 * dependem de deep DOM navigation frágil em múltiplas rotas. Ficam como
 * follow-up junto com data-testid attrs nas views de chat.
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

test('authenticated shell — does not render login screen', async () => {
  launched = await launchApp({ auth: 'mock' });
  // Ao contrário do smoke 'login screen reachable', aqui o título de login
  // NÃO deve estar presente. Damos até 5s pra renderer hidratar auth state.
  const loginTitle = launched.window.getByText(/(Sign in to|Entrar no) G4 OS/);
  await expect(loginTitle).toHaveCount(0, { timeout: 5_000 });
});

test('authenticated shell — activity rail visible without login', async () => {
  launched = await launchApp({ auth: 'mock' });
  const sidebar = launched.window.locator('[aria-label*="ctivit" i], [aria-label*="ctivid" i]');
  await expect(sidebar).toBeVisible({ timeout: 15_000 });
});
