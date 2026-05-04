import { enUS, type TranslationKey } from './locales/en-us.ts';
import { ptBR } from './locales/pt-br.ts';
import type { AppLocale, TranslationDictionary } from './types.ts';

export const DEFAULT_LOCALE: AppLocale = 'pt-BR';

// Object.freeze em runtime previne mutação acidental dos dicionários em testes
// ou hot-reload — sem freeze, `dictionaries['en-US']['app.name'] = 'x'` silencia
// em TS com cast e corrompe todos os consumers (módulos JS são singleton).
export const dictionaries: Readonly<Record<AppLocale, TranslationDictionary<TranslationKey>>> =
  Object.freeze({
    'en-US': Object.freeze(enUS),
    'pt-BR': Object.freeze(ptBR),
  });

export const supportedLocales = Object.keys(dictionaries) as readonly AppLocale[];

export type { TranslationKey } from './locales/en-us.ts';
