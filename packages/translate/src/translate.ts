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
  // CR8-72: localStorage pode lançar (private mode no Safari, quota
  // exceeded, sandbox restrito). Fallback gracioso para navigator.language.
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
  // CR8-72: idem — localStorage.setItem pode lançar QuotaExceededError.
  // Persistência é best-effort; se falha, próximo boot reverte ao default
  // mas a sessão atual continua com o locale escolhido.
  try {
    globalThis.window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // best-effort
  }
}

// CR8-30: regex aceita dots em token names (`{{nested.key}}`). O `\w+`
// anterior parava no primeiro `.` e deixava `{{user.name}}` virar string
// vazia — chaves nested em params nunca substituíam.
const PLACEHOLDER_RE = /\{\{([a-zA-Z_$][a-zA-Z0-9_$.]*)\}\}/gu;

function resolveParam(params: TranslationParams, token: string): unknown {
  if (!token.includes('.')) return params[token];
  // CR8-30: lookup nested via dot-path. `params['user.name']` direto cobre
  // chaves achatadas; quando não existe, faz traversal em `user.name`.
  if (token in params) return params[token];
  let cursor: unknown = params;
  for (const segment of token.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
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

// CR8-81: Intl.* lança RangeError em locales não suportados (raros, mas
// possíveis em legacy locales armazenados ou bug de region). Fallback
// silencioso pra ISO/string raw em vez de quebrar a UI inteira.
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
