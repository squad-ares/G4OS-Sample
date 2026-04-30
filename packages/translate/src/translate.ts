import { DEFAULT_LOCALE, dictionaries, type TranslationKey } from './messages.ts';
import type { AppLocale, TranslationParams } from './types.ts';

const LOCALE_STORAGE_KEY = 'g4os.locale';

export function normalizeLocale(locale: string | null | undefined): AppLocale {
  const normalized = locale?.toLowerCase();
  if (normalized?.startsWith('en') === true) return 'en-US';
  if (normalized?.startsWith('pt') === true) return 'pt-BR';
  return DEFAULT_LOCALE;
}

export function resolveInitialLocale(): AppLocale {
  if (typeof globalThis.window === 'undefined') return DEFAULT_LOCALE;
  // localStorage pode lançar em private mode (Safari), quota exceeded ou sandbox.
  // Fallback gracioso para navigator.language.
  let stored: string | null = null;
  try {
    stored = globalThis.window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  return normalizeLocale(stored ?? globalThis.window.navigator.language);
}

export function persistLocale(locale: AppLocale): void {
  if (typeof globalThis.window === 'undefined') return;
  // localStorage.setItem pode lançar QuotaExceededError — persistência é
  // best-effort; falha reverte ao default no próximo boot.
  try {
    globalThis.window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // best-effort
  }
}

// Regex aceita dots em token names (`{{nested.key}}`) — `\w+` básico
// parava no primeiro `.` e deixava substituições nested falharem silenciosamente.
const PLACEHOLDER_RE = /\{\{([a-zA-Z_$][a-zA-Z0-9_$.]*)\}\}/gu;

function resolveParam(params: TranslationParams, token: string): unknown {
  // Sem `Object.hasOwn`, lookups como `{{__proto__}}` injetam
  // `[object Object]` na UI via String(value) — text injection via template.
  // `Object.hasOwn` força chaves próprias do params.
  if (!token.includes('.')) {
    return Object.hasOwn(params, token) ? params[token] : undefined;
  }
  // Lookup nested via dot-path — `params['user.name']` direto cobre
  // chaves achatadas; senão faz traversal em `user.name`.
  if (Object.hasOwn(params, token)) return params[token];
  let cursor: unknown = params;
  for (const segment of token.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    if (!Object.hasOwn(cursor as object, segment)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const template = dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  if (!params) return template;

  return template.replace(PLACEHOLDER_RE, (_match, token: string) => {
    const value = resolveParam(params, token);
    return value === undefined ? '' : String(value);
  });
}

// Intl.* lança RangeError em locales não suportados (raros, mas possíveis
// em legacy locales armazenados). Fallback silencioso para ISO/string raw.
export function formatDate(
  locale: AppLocale,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

export function formatNumber(
  locale: AppLocale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatRelativeTime(
  locale: AppLocale,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
  } catch {
    return `${value} ${unit}`;
  }
}
