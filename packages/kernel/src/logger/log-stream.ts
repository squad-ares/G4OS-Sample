/**
 * LogStream — fan-out singleton de log lines em paralelo ao pino transport.
 *
 * Por que singleton: o `wrapPinoLogger` é chamado em todos os pacotes; cada
 * `createLogger(scope)` produz uma instância Logger nova. Para que o Debug HUD veja todos os logs, precisamos de um ponto de fan-out global.
 *
 * Custo zero quando sem subscribers: o `emit` interno faz early-return se
 * `subscribers.size === 0`, evitando object allocation na linha quente.
 *
 * **Importante sobre redact:** pino aplica redact em paths configurados na
 * serialização para arquivo. O `ctx` que `wrapPinoLogger` repassa pra cá é
 * o **objeto cru** — então o LogStream aplica scrub próprio (`scrubLogCtx`)
 * antes de emitir. Mantém paridade de privacidade com o transport pino e
 * cobre o caso em que caller acidentalmente loga `{ password, token, ... }`.
 */

export interface LogStreamLine {
  readonly level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  readonly time: number;
  readonly component: string;
  readonly msg: string;
  readonly ctx?: Readonly<Record<string, unknown>>;
}

export type LogStreamSubscriber = (line: LogStreamLine) => void;

class LogStream {
  private readonly subscribers = new Set<LogStreamSubscriber>();

  subscribe(handler: LogStreamSubscriber): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  /** Verdadeiro se há ao menos 1 subscriber — usado pelo emit inline. */
  hasSubscribers(): boolean {
    return this.subscribers.size > 0;
  }

  emit(line: LogStreamLine): void {
    if (this.subscribers.size === 0) return;
    const safe = line.ctx ? { ...line, ctx: scrubLogCtx(line.ctx) } : line;
    for (const subscriber of this.subscribers) {
      try {
        subscriber(safe);
      } catch {
        // Subscriber malformado nao pode quebrar a cadeia de log.
      }
    }
  }
}

export const logStream = new LogStream();

/**
 * Set de chaves sensíveis em lowercase para lookup O(1). Espelha
 * `SENSITIVE_KEYS` em `logger.ts` mas mantido independente para evitar
 * import circular (logger.ts importa este módulo).
 */
const SENSITIVE_KEYS_LOWER = new Set([
  'apikey',
  'api_key',
  'anthropicapikey',
  'anthropic_api_key',
  'openaiapikey',
  'openai_api_key',
  'geminiapikey',
  'gemini_api_key',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authtoken',
  'auth_token',
  'token',
  'password',
  'pwd',
  'authorization',
  'cookie',
  'x-api-key',
]);

const REDACT_CENSOR = '[REDACTED]';
const SCRUB_MAX_DEPTH = 4;

/**
 * Scrub recursivo limitado a `SCRUB_MAX_DEPTH` níveis. Mantém shape
 * geral do contexto mas substitui valores em chaves sensíveis por
 * `[REDACTED]`. O loop não copia primitivos — só objetos com matches.
 */
function scrubLogCtx(ctx: Readonly<Record<string, unknown>>, depth = 0): Record<string, unknown> {
  if (depth >= SCRUB_MAX_DEPTH) return { ...ctx };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (SENSITIVE_KEYS_LOWER.has(key.toLowerCase())) {
      out[key] = REDACT_CENSOR;
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = scrubLogCtx(value as Record<string, unknown>, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}
