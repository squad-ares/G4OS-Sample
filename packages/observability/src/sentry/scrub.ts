export const SCRUB_KEYS: readonly string[] = [
  'password',
  'pwd',
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'api_key',
  'apiKey',
  'authorization',
  'cookie',
  'secret',
  'x-api-key',
];

export const SCRUB_CENSOR = '[REDACTED]';

export const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /AIza[a-zA-Z0-9_-]{30,}/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // CR-18 F-O1: tokens opacos não-JWT que vazavam pelo debug ZIP via texto
  // bruto (logs em JSONL passam por `scrubString`, sem visibilidade de
  // chave). Cobertura espelha o catálogo de providers reais de SDK.
  // GitHub PAT/OAuth/server-to-server (`gho_`, `ghp_`, `ghr_`, `ghs_`, `ghu_`).
  /\bgh[oprsu]_[A-Za-z0-9]{20,}/g,
  // Slack bot/app/refresh/user (`xoxb-`, `xoxa-`, `xoxp-`, `xoxr-`, `xoxs-`).
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  // Notion-style opaque secrets (`secret_<40chars>`).
  /\bsecret_[A-Za-z0-9]{20,}/g,
  // Bearer/Basic em headers logados (`Authorization: Bearer <opaque>`).
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._\-+/=]{16,}/gi,
  // Home dirs com username (PII): /Users/<user>/..., /home/<user>/..., C:\Users\<user>\...
  /\/Users\/[^/\s]+/g,
  /\/home\/[^/\s]+/g,
  // Lowercase drive letters (`c:\Users\...`) também precisam ser
  // redacted. Sem isso, paths normalizados via `path.resolve()` no Windows
  // (que pode lowercase a letra) vazam username.
  /[A-Za-z]:\\Users\\[^\\\s]+/g,
  // Email
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Variações que escapavam dos patterns clássicos.
  // URL-encoded `@` (`user%40example.com`) — emails escapados em querystring.
  /[a-zA-Z0-9._+-]+%40[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // JWT em querystring (`?token=eyJ...`).
  /[?&](?:token|access_token|id_token|jwt)=eyJ[A-Za-z0-9_.-]+/g,
  // Basic auth embutido na URL (`https://user:pass@host/...`).
  /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/g,
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SCRUB_KEYS.some((sensitive) => lower.includes(sensitive.toLowerCase()));
}

// Cache `original → scrubbed` em WeakMap. A versão antiga usava
// `WeakSet<object>` e, ao reencontrar um objeto compartilhado, retornava o
// ORIGINAL não-scrubado — Sentry vazava PII sempre que duas referências do
// mesmo objeto apareciam no event (frames reaproveitando `vars`,
// `mechanism.data` igual ao `extra`, etc.). Agora retornamos a cópia já
// scrubada, e registramos `original → out` ANTES de recursar para suportar
// ciclos sem stack overflow.
export function scrubObject<T>(input: T, seen: WeakMap<object, unknown> = new WeakMap()): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return scrubString(input) as unknown as T;
  if (typeof input !== 'object') return input;

  const cached = seen.get(input as object);
  if (cached !== undefined) return cached as T;

  // Frozen objects fazem mutação em-place falhar silenciosamente
  // (TypeError em strict mode, no-op em non-strict). Substituir tudo pelo
  // sentinel é a opção segura — frozen costuma sinalizar config/segredo.
  if (Object.isFrozen(input)) {
    return SCRUB_CENSOR as unknown as T;
  }

  // Tipos object não-Plain — Map/Set/Date/RegExp passariam pelo
  // `Object.entries` retornando vazio (ou ISO string sem redação no Date).
  // Sentry SDK Node anexa frequentemente `user: { createdAt: Date, metadata: Map }`.
  // Sem branches específicos, esses payloads vazavam SEM redação.
  if (input instanceof Date) {
    // ISO string pode embutir contexto; ainda assim Date inteiro é redacted
    // por padrão (preserva estrutura mas remove valor exato).
    return SCRUB_CENSOR as unknown as T;
  }
  if (input instanceof Map) {
    const out = new Map<unknown, unknown>();
    seen.set(input as object, out);
    for (const [k, v] of input as Map<unknown, unknown>) {
      const scrubKey =
        typeof k === 'string' && isSensitiveKey(k) ? SCRUB_CENSOR : scrubObject(k, seen);
      const scrubVal =
        typeof k === 'string' && isSensitiveKey(k) ? SCRUB_CENSOR : scrubObject(v, seen);
      out.set(scrubKey, scrubVal);
    }
    return out as unknown as T;
  }
  if (input instanceof Set) {
    const out = new Set<unknown>();
    seen.set(input as object, out);
    for (const item of input as Set<unknown>) out.add(scrubObject(item, seen));
    return out as unknown as T;
  }
  if (input instanceof RegExp) {
    // RegExp source pode conter dados (ex.: regex contra um email específico)
    return SCRUB_CENSOR as unknown as T;
  }

  if (Array.isArray(input)) {
    const out: unknown[] = [];
    seen.set(input as object, out);
    for (const item of input) out.push(scrubObject(item, seen));
    return out as unknown as T;
  }

  const source = input as Record<string | symbol, unknown>;
  const out: Record<string, unknown> = {};
  seen.set(input as object, out);
  // `Object.entries` salta Symbol keys. Caller pode anexar
  // `event[Symbol.for('pii')] = email` (Sentry SDK middlewares fazem isso).
  // Iteramos `Reflect.ownKeys` mas só aceitamos string keys no output —
  // Symbol-keyed slots são propositalmente descartados (não há serialização
  // confiável para JSON Sentry payload, e o conteúdo é classificado PII por
  // default).
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key === 'symbol') continue;
    const value = source[key];
    if (isSensitiveKey(key)) {
      out[key] = SCRUB_CENSOR;
    } else {
      out[key] = scrubObject(value, seen);
    }
  }
  return out as unknown as T;
}

export function scrubString(input: string): string {
  let out = input;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, SCRUB_CENSOR);
  }
  return out;
}

export interface SentryStackFrameLike {
  vars?: Record<string, unknown> | undefined;
  abs_path?: string | undefined;
  filename?: string | undefined;
  // Sentry frame schema também carrega linhas de código fonte
  // (com possíveis API keys hardcoded, emails, paths). Sem redação,
  // segredos no código de produção vazam pelo stack trace.
  context_line?: string | undefined;
  pre_context?: string[] | undefined;
  post_context?: string[] | undefined;
}

export interface SentryExceptionMechanismLike {
  type?: string | undefined;
  handled?: boolean | undefined;
  synthetic?: boolean | undefined;
  data?: Record<string, unknown> | undefined;
}

export interface SentryExceptionValueLike {
  type?: string | undefined;
  value?: string | undefined;
  stacktrace?: { frames?: SentryStackFrameLike[] | undefined } | undefined;
  mechanism?: SentryExceptionMechanismLike | undefined;
}

export interface SentryEventLike {
  contexts?: Record<string, unknown> | undefined;
  extra?: Record<string, unknown> | undefined;
  request?: Record<string, unknown> | undefined;
  tags?: Record<string, unknown> | undefined;
  breadcrumbs?: Array<Record<string, unknown>> | undefined;
  message?: string | undefined;
  exception?: { values?: SentryExceptionValueLike[] | undefined } | undefined;
}

function scrubExceptionFrames(
  frames: SentryStackFrameLike[] | undefined,
): SentryStackFrameLike[] | undefined {
  if (!frames) return frames;
  return frames.map((frame) => {
    const next: SentryStackFrameLike = { ...frame };
    if (frame.vars) next.vars = scrubObject(frame.vars);
    if (typeof frame.abs_path === 'string') next.abs_path = scrubString(frame.abs_path);
    if (typeof frame.filename === 'string') next.filename = scrubString(frame.filename);
    // Linhas de código fonte ao redor do erro também precisam de
    // redação (podem conter API keys hardcoded, emails, paths absolutos).
    if (typeof frame.context_line === 'string') next.context_line = scrubString(frame.context_line);
    if (frame.pre_context) next.pre_context = frame.pre_context.map(scrubString);
    if (frame.post_context) next.post_context = frame.post_context.map(scrubString);
    return next;
  });
}

function scrubExceptionValues(
  values: SentryExceptionValueLike[] | undefined,
): SentryExceptionValueLike[] | undefined {
  if (!values) return values;
  return values.map((value) => {
    const next: SentryExceptionValueLike = { ...value };
    if (typeof value.value === 'string') next.value = scrubString(value.value);
    if (value.stacktrace) {
      next.stacktrace = { frames: scrubExceptionFrames(value.stacktrace.frames) };
    }
    // Sentry SDK Node anexa `mechanism: { type, handled, synthetic, data }`
    // a exceções; `data` é livre e pode conter PII custom.
    if (value.mechanism?.data) {
      next.mechanism = { ...value.mechanism, data: scrubObject(value.mechanism.data) };
    }
    return next;
  });
}

export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  const out = { ...event };
  if (out.contexts) out.contexts = scrubObject(out.contexts);
  if (out.extra) out.extra = scrubObject(out.extra);
  if (out.request) out.request = scrubObject(out.request);
  if (out.tags) out.tags = scrubObject(out.tags);
  if (out.breadcrumbs) out.breadcrumbs = scrubObject(out.breadcrumbs);
  if (typeof out.message === 'string') out.message = scrubString(out.message);
  // Stack traces vão direto do Node (Error.stack) — eles trazem `value`
  // (mensagem da exceção, frequentemente com path/email/token interpolado),
  // `vars` (locais capturadas em runtime quando attachStacktrace está ativo)
  // e `abs_path/filename` (paths absolutos que vazam home dir do usuário).
  if (out.exception) {
    out.exception = { values: scrubExceptionValues(out.exception.values) };
  }
  return out;
}
