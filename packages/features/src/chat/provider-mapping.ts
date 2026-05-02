/**
 * Mapping helpers between the three provider identifiers used across layers:
 *
 *   - `ModelProvider` (catalog): `'claude' | 'codex' | 'pi-google' | 'pi-openai'`
 *   - `SessionProvider` (schema): `'claude' | 'openai' | 'openai_compat' | 'gemini' | 'bedrock' | 'codex'`
 *   - Connection slug (agent factory): `'anthropic-direct' | 'openai-direct' | 'google-direct' | ...`
 *
 * The catalog's `ModelProvider` is UI-facing. `SessionProvider` is what gets
 * persisted. Connection slug is what the `AgentRegistry` resolves factories by.
 *
 * CR-30 F-CR30-10: `SessionProvider → connection slug` é importado do
 * `@g4os/kernel/types` (`connectionSlugForProvider`). Antes havia uma cópia
 * literal aqui; cada novo provider exigia editar dois lugares e drift era
 * inevitável. `SessionProviderKind` virou um type alias re-exportado pra
 * preservar API pública dos consumidores.
 */

import type { SessionProvider } from '@g4os/kernel/types';
import { connectionSlugForProvider } from '@g4os/kernel/types';
import type { ModelProvider } from './model-catalog.ts';

export type SessionProviderKind = SessionProvider;

export function modelProviderToSession(provider: ModelProvider): SessionProviderKind {
  switch (provider) {
    case 'claude':
      return 'claude';
    case 'pi-openai':
      return 'openai';
    case 'pi-google':
      return 'gemini';
    case 'codex':
      return 'codex';
  }
}

export function sessionProviderToConnectionSlug(provider: SessionProviderKind): string {
  return connectionSlugForProvider(provider);
}

export function modelProviderToConnectionSlug(provider: ModelProvider): string {
  return connectionSlugForProvider(modelProviderToSession(provider));
}
