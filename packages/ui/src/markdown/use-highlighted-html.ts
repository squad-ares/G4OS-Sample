const cache = new Map<string, string>();

async function highlight(code: string, lang: string): Promise<string> {
  const key = `${lang}:::${code}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const specifier = 'shiki';
    const { createHighlighter } = (await import(
      /* @vite-ignore */ specifier
    )) as typeof import('shiki');
    const highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: [lang].filter(Boolean),
    });
    const html = highlighter.codeToHtml(code, { lang: lang || 'text', theme: 'github-dark' });
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

import { useEffect, useState } from 'react';

export function useHighlightedHtml(code: string, lang: string): string {
  const [html, setHtml] = useState<string>(() => {
    const key = `${lang}:::${code}`;
    return cache.get(key) ?? '';
  });

  useEffect(() => {
    let cancelled = false;
    void highlight(code, lang).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  return html;
}
