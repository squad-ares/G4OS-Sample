/**
 * Mapping helpers between the three provider identifiers used across layers:
 *
 *   - `ModelProvider` (catalog): `'claude' | 'codex' | 'pi-google' | 'pi-openai'`
 *   - `SessionProvider` (schema): `'claude' | 'openai' | 'openai_compat' | 'gemini' | 'bedrock' | 'codex'`
 *   - Connection slug (agent factory): `'anthropic-direct' | 'openai-direct' | 'google-direct' | ...`
 *
 * The catalog's `ModelProvider` is UI-facing. `SessionProvider` is what gets
 * persisted. Connection slug is what the `AgentRegistry` resolves factories by.
 */

import type { ModelProvider } from './model-catalog.ts';

export type SessionProviderKind =
  | 'claude'
  | 'openai'
  | 'openai_compat'
  | 'gemini'
  | 'bedrock'
  | 'codex';

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
  switch (provider) {
    case 'claude':
      return 'anthropic-direct';
    case 'openai':
      return 'openai-direct';
    case 'openai_compat':
      return 'openai-compat';
    case 'gemini':
      return 'google-direct';
    case 'bedrock':
      return 'bedrock-claude';
    case 'codex':
      return 'codex-local';
  }
}

export function modelProviderToConnectionSlug(provider: ModelProvider): string {
  return sessionProviderToConnectionSlug(modelProviderToSession(provider));
}
