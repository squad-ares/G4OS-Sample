import type { SessionProvider } from './session.ts';

/**
 * Mapeia o `SessionProvider` da sessão para o slug da conexão que o
 * `AgentRegistry` usa (ex: `anthropic-direct`, `google-direct`, etc.).
 * Helper puro sem dependências — usado pelo `TurnDispatcher` para resolver
 * o agent factory.
 */
export function connectionSlugForProvider(provider: SessionProvider): string {
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
