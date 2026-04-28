import type { AgentError } from '@g4os/kernel/errors';
import { wrapAgentError } from '../../shared/errors/wrap-agent-error.ts';

/**
 * Mantida como wrapper sobre `wrapAgentError` para preservar a API
 * histórica (alguns chamadores fora do pacote ainda importam
 * `mapOpenAIError`). Nova implementação delega ao helper compartilhado
 * que cobre 401/403/429/5xx consistentemente em OpenAI + Google + Claude.
 */
export function mapOpenAIError(cause: unknown, provider: string): AgentError {
  return wrapAgentError(cause, provider);
}

export function normalizeBaseUrl(baseUrl: string): string {
  let normalized = baseUrl.trim().replace(/\/+$/u, '');
  if (normalized.endsWith('/chat/completions')) {
    normalized = normalized.slice(0, -'/chat/completions'.length);
  }
  return normalized;
}
