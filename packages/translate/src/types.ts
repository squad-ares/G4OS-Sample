export type AppLocale = 'en-US' | 'pt-BR';

export type TranslationParams = Readonly<Record<string, string | number>>;

export type TranslationDictionary<TKey extends string = string> = Readonly<Record<TKey, string>>;
