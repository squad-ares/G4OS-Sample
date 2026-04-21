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
  const stored = globalThis.window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return normalizeLocale(stored ?? globalThis.window.navigator.language);
}

export function persistLocale(locale: AppLocale): void {
  if (typeof globalThis.window === 'undefined') return;
  globalThis.window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const template = dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  if (!params) return template;

  return template.replace(/\{\{(\w+)\}\}/gu, (_match, token) => {
    const value = params[token];
    return value === undefined ? '' : String(value);
  });
}

export function formatDate(
  locale: AppLocale,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

export function formatNumber(
  locale: AppLocale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatRelativeTime(
  locale: AppLocale,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
}
