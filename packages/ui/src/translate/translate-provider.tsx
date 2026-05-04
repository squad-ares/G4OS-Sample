import {
  type AppLocale,
  DEFAULT_LOCALE,
  formatDate,
  formatNumber,
  formatRelativeTime,
  normalizeLocale,
  persistLocale,
  resolveInitialLocale,
  type TranslationKey,
  type TranslationParams,
  translate,
} from '@g4os/translate';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

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

  // Sincroniza locale entre janelas Electron (multi-window) via evento `storage`.
  // ADR-0012: listener registrado via useEffect garante cleanup no unmount.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'g4os.locale' && e.newValue !== null) {
        setLocaleState(normalizeLocale(e.newValue));
      }
    };
    globalThis.window?.addEventListener('storage', onStorage);
    return () => {
      globalThis.window?.removeEventListener('storage', onStorage);
    };
  }, []);

  // CR-32 F-CR32-6: memoiza o context value. Antes o objeto era criado
  // inline em cada render do provider — toda mudança no estado de um
  // ancestral re-renderizava o `<TranslateContext.Provider>` com referência
  // nova, forçando re-render em cascata em todos os consumers de
  // `useTranslate()` (chat, sub-sidebar, listas virtualizadas). `setLocale`
  // é estável (state setter); demais helpers dependem só de `locale`.
  const value = useMemo<TranslateContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
      formatDate: (input: Date | number | string, options?: Intl.DateTimeFormatOptions) =>
        formatDate(locale, input, options),
      formatNumber: (input: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(locale, input, options),
      formatRelativeTime: (input: number, unit: Intl.RelativeTimeFormatUnit) =>
        formatRelativeTime(locale, input, unit),
    }),
    [locale],
  );

  return <TranslateContext.Provider value={value}>{children}</TranslateContext.Provider>;
}

export function useTranslate(): TranslateContextValue {
  const context = useContext(TranslateContext);
  if (context) return context;
  // Fallback graceful em vez de throw — componentes carregados antes do TranslateProvider
  // (Suspense, lazy boundary, dev hot-reload) retornam context degradado com DEFAULT_LOCALE.
  // Usar translate() diretamente garante que o usuário vê texto real, não chaves técnicas.
  // F-CR49-13: em produção o fallback usa o locale padrão — strings reais
  // aparecem, não chaves técnicas. Ausência de provider é bug de integração;
  // cabe ao consumidor garantir que <TranslateProvider> esteja no tree.
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => undefined,
    t: (key: TranslationKey, params?: TranslationParams) => translate(DEFAULT_LOCALE, key, params),
    formatDate: (value, options) => formatDate(DEFAULT_LOCALE, value, options),
    formatNumber: (value, options) => formatNumber(DEFAULT_LOCALE, value, options),
    formatRelativeTime: (value, unit) => formatRelativeTime(DEFAULT_LOCALE, value, unit),
  };
}
