import { enUS, type TranslationKey } from './locales/en-us.ts';
import { ptBR } from './locales/pt-br.ts';
import type { AppLocale, TranslationDictionary } from './types.ts';

export const DEFAULT_LOCALE: AppLocale = 'pt-BR';

export const dictionaries: Readonly<Record<AppLocale, TranslationDictionary<TranslationKey>>> = {
  'en-US': enUS,
  'pt-BR': ptBR,
};

export const supportedLocales = Object.keys(dictionaries) as readonly AppLocale[];

export type { TranslationKey } from './locales/en-us.ts';
