import {
  type AppLocale,
  DEFAULT_LOCALE,
  formatDate,
  formatNumber,
  formatRelativeTime,
  persistLocale,
  resolveInitialLocale,
  type TranslationKey,
  type TranslationParams,
  translate,
} from '@g4os/translate';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

interface TranslateContextValue {
  readonly locale: AppLocale;
  readonly setLocale: (locale: AppLocale) => void;
  readonly t: (key: TranslationKey, params?: TranslationParams) => string;
  readonly formatDate: (
    value: Date | number | string,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  readonly formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  readonly formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => string;
}

const TranslateContext = createContext<TranslateContextValue | null>(null);

export interface TranslateProviderProps {
  readonly children: ReactNode;
  readonly defaultLocale?: AppLocale;
}

export function TranslateProvider({
  children,
  defaultLocale = DEFAULT_LOCALE,
}: TranslateProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(
    () => resolveInitialLocale() ?? defaultLocale,
  );

  useEffect(() => {
    persistLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <TranslateContext.Provider
      value={{
        locale,
        setLocale: setLocaleState,
        t: (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
        formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) =>
          formatDate(locale, value, options),
        formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
          formatNumber(locale, value, options),
        formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
          formatRelativeTime(locale, value, unit),
      }}
    >
      {children}
    </TranslateContext.Provider>
  );
}

export function useTranslate(): TranslateContextValue {
  const context = useContext(TranslateContext);
  if (context) return context;
  // Fallback graceful em vez de throw — componentes carregados antes do TranslateProvider
  // (Suspense, lazy boundary, dev hot-reload) retornam context degradado:
  // `t` ecoa a chave, locale=DEFAULT_LOCALE. Chaves cruas na UI sinalizam o problema ao dev.
  // Fallback degradado — só ergonomia/dev-mode, sem dependência do dictionary.
  return {
    locale: 'pt-BR' as AppLocale,
    setLocale: () => undefined,
    t: ((key: unknown) => String(key)) as TranslateContextValue['t'],
    formatDate: (value) => String(value),
    formatNumber: (value) => String(value),
    formatRelativeTime: (value) => String(value),
  };
}
