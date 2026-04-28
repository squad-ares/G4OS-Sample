import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  readonly theme: Theme;
  readonly resolved: ResolvedTheme;
  readonly setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

function resolveTheme(t: Theme): ResolvedTheme {
  if (t === 'system') {
    if (!isBrowser) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

function readPersistedTheme(): Theme {
  if (!isBrowser) return 'system';
  try {
    const stored = window.localStorage?.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage indisponível (SSR, modo privado restrito)
  }
  return 'system';
}

function persistTheme(theme: Theme): void {
  if (!isBrowser) return;
  try {
    window.localStorage?.setItem('theme', theme);
  } catch {
    // best-effort
  }
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readPersistedTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(theme));

  useEffect(() => {
    if (!isBrowser) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      setResolved(resolveTheme(theme));
    };
    update();
    mql.addEventListener('change', update);
    return () => {
      mql.removeEventListener('change', update);
    };
  }, [theme]);

  useEffect(() => {
    if (!isBrowser) return;
    document.documentElement.dataset['theme'] = resolved;
  }, [resolved]);

  const setTheme = useCallback((t: Theme) => {
    persistTheme(t);
    setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
