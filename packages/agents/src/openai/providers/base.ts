import type { AgentError } from '@g4os/kernel/errors';
import { AgentError as AE } from '@g4os/kernel/errors';

export function mapOpenAIError(cause: unknown, provider: string): AgentError {
  if (cause instanceof Error && 'status' in cause) {
    const status = (cause as { status?: number }).status;
    if (status === 429) return AE.rateLimited(provider);
    if (status !== undefined && status >= 500) return AE.network(provider, cause);
  }
  return AE.unavailable(provider, cause);
}

export function normalizeBaseUrl(baseUrl: string): string {
  let normalized = baseUrl.trim().replace(/\/+$/u, '');
  if (normalized.endsWith('/chat/completions')) {
    normalized = normalized.slice(0, -'/chat/completions'.length);
  }
  return normalized;
}
