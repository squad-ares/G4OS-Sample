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
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SCRUB_KEYS.some((sensitive) => lower.includes(sensitive.toLowerCase()));
}

export function scrubObject<T>(input: T, seen: WeakSet<object> = new WeakSet()): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return scrubString(input) as unknown as T;
  if (typeof input !== 'object') return input;

  if (seen.has(input as object)) return input;
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.map((item) => scrubObject(item, seen)) as unknown as T;
  }

  const source = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
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

export interface SentryEventLike {
  contexts?: Record<string, unknown> | undefined;
  extra?: Record<string, unknown> | undefined;
  request?: Record<string, unknown> | undefined;
  tags?: Record<string, unknown> | undefined;
  breadcrumbs?: Array<Record<string, unknown>> | undefined;
  message?: string | undefined;
}

export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  const out = { ...event };
  if (out.contexts) out.contexts = scrubObject(out.contexts);
  if (out.extra) out.extra = scrubObject(out.extra);
  if (out.request) out.request = scrubObject(out.request);
  if (out.tags) out.tags = scrubObject(out.tags);
  if (out.breadcrumbs) out.breadcrumbs = scrubObject(out.breadcrumbs);
  if (typeof out.message === 'string') out.message = scrubString(out.message);
  return out;
}
