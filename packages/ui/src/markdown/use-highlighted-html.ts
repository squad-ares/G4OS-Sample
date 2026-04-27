/**
 * Shiki highlighter com:
 *   - Singleton lazy-loaded (uma instância por sessão de browser, não por
 *     bloco de código). Carregar Shiki + WASM custa ~MB; antes recriavamos
 *     a cada call.
 *   - LRU cache com cap fixo (não deixa Map crescer indefinidamente em
 *     sessão longa com muitos snippets distintos).
 *   - Suporte a tema light/dark via dual-theme do Shiki, escolhido pelo
 *     consumer via `theme` arg.
 *   - Lazy `loadLanguage` incremental (singleton acumula só os langs já
 *     vistos, sem re-criar highlighter).
 */

import { useEffect, useState } from 'react';

type ShikiHighlighter = {
  codeToHtml(code: string, options: { lang: string; theme: string }): string;
  loadLanguage(lang: string): Promise<void>;
  getLoadedLanguages(): string[];
};

const SUPPORTED_THEMES = ['github-dark', 'github-light'] as const;
type SupportedTheme = (typeof SUPPORTED_THEMES)[number];

const CACHE_CAP = 256;

class LruCache<V> {
  readonly #map = new Map<string, V>();
  readonly #cap: number;

  constructor(cap: number) {
    this.#cap = cap;
  }

  get(key: string): V | undefined {
    const value = this.#map.get(key);
    if (value === undefined) return undefined;
    // Refresh recency: re-insert at the back of the iteration order
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, value);
    while (this.#map.size > this.#cap) {
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      this.#map.delete(oldest);
    }
  }
}

const cache = new LruCache<string>(CACHE_CAP);
let highlighterPromise: Promise<ShikiHighlighter> | null = null;
const loadedLangs = new Set<string>();

async function getHighlighter(): Promise<ShikiHighlighter> {
  if (highlighterPromise === null) {
    const specifier = 'shiki';
    const { createHighlighter } = (await import(
      /* @vite-ignore */ specifier
    )) as typeof import('shiki');
    highlighterPromise = createHighlighter({
      themes: [...SUPPORTED_THEMES],
      langs: [],
    }) as Promise<ShikiHighlighter>;
  }
  return highlighterPromise;
}

async function ensureLanguageLoaded(highlighter: ShikiHighlighter, lang: string): Promise<void> {
  if (loadedLangs.has(lang)) return;
  try {
    await highlighter.loadLanguage(lang);
    loadedLangs.add(lang);
  } catch {
    // Lang desconhecido — fallback no codeToHtml com `lang: 'text'` cuida.
    loadedLangs.add(lang); // marca pra não tentar de novo
  }
}

async function highlight(code: string, lang: string, theme: SupportedTheme): Promise<string> {
  const key = `${theme}:::${lang}:::${code}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const highlighter = await getHighlighter();
    if (lang) await ensureLanguageLoaded(highlighter, lang);
    const html = highlighter.codeToHtml(code, { lang: lang || 'text', theme });
    cache.set(key, html);
    return html;
  } catch {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fallback = `<pre><code>${escaped}</code></pre>`;
    cache.set(key, fallback);
    return fallback;
  }
}

export { highlight };

export function useHighlightedHtml(
  code: string,
  lang: string,
  theme: SupportedTheme = 'github-dark',
): string {
  const [html, setHtml] = useState<string>(() => {
    const key = `${theme}:::${lang}:::${code}`;
    return cache.get(key) ?? '';
  });

  useEffect(() => {
    let cancelled = false;
    void highlight(code, lang, theme).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang, theme]);

  return html;
}
