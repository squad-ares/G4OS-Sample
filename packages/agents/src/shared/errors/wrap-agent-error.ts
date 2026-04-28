import { AgentError } from '@g4os/kernel/errors';

/**
 * Mapeia erros de SDK HTTP (Anthropic / OpenAI / Google / OpenRouter / etc)
 * para `AgentError` semanticamente correto:
 *
 * - 401 / 403           → `invalidApiKey` ("Invalid API key for ...")
 * - 429                 → `rateLimited` (com `Retry-After` se vier)
 * - 5xx                 → `network` (servidor caiu)
 * - resto              → `unavailable` (genérico)
 *
 * Antes desta função, OpenAI e Google caíam direto em `AgentError.network(...)`
 * mesmo para 401/403 — UX inconsistente entre Claude (que mapeava 401 → "Invalid
 * API key" via `wrapError` próprio) e os outros providers (que diziam "Network
 * error" mesmo quando o problema era a chave).
 */
export function wrapAgentError(cause: unknown, provider: string): AgentError {
  if (cause instanceof AgentError) return cause;

  const status = extractStatus(cause);

  if (status === 401 || status === 403) {
    return AgentError.invalidApiKey(provider, cause);
  }
  if (status === 429) {
    const retryAfterMs = extractRetryAfterMs(cause);
    return AgentError.rateLimited(provider, retryAfterMs);
  }
  if (status !== undefined && status >= 500) {
    return AgentError.network(provider, cause);
  }

  return AgentError.unavailable(provider, cause);
}

function extractStatus(cause: unknown): number | undefined {
  if (cause === null || typeof cause !== 'object') return undefined;
  const r = cause as Record<string, unknown>;

  // Anthropic SDK + OpenAI SDK + fetch Response: status no objeto
  if (typeof r['status'] === 'number') return r['status'];

  // Wrapped HTTP response in `response.status`
  const response = r['response'];
  if (response !== null && typeof response === 'object') {
    const rr = response as Record<string, unknown>;
    if (typeof rr['status'] === 'number') return rr['status'];
  }

  // node-fetch quirk
  if (typeof r['statusCode'] === 'number') return r['statusCode'];

  return undefined;
}

function extractRetryAfterMs(cause: unknown): number | undefined {
  if (cause === null || typeof cause !== 'object') return undefined;
  const r = cause as Record<string, unknown>;
  const headers = r['headers'];
  if (headers === null || typeof headers !== 'object') return undefined;
  const hh = headers as Record<string, unknown>;
  const ra = hh['retry-after'] ?? hh['Retry-After'];
  if (typeof ra === 'string') {
    const parsed = Number.parseFloat(ra);
    if (!Number.isNaN(parsed)) return Math.max(0, parsed * 1000);
  }
  if (typeof ra === 'number') return Math.max(0, ra * 1000);
  return undefined;
}
