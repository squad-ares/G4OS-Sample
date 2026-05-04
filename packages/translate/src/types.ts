export type AppLocale = 'en-US' | 'pt-BR';

export type TranslationParams = Readonly<Record<string, string | number | boolean | Date>>;

export type TranslationDictionary<TKey extends string = string> = Readonly<Record<TKey, string>>;
