import { PreferencesCategory } from '@g4os/features/settings';
import { toast, useTranslate } from '@g4os/ui';
import { useCallback, useState } from 'react';
import { queryClient } from '../../ipc/query-client.ts';

const SEEN_NEWS_STORAGE_KEY = 'g4os.news.seenIds';
const PREFERENCES_STORAGE_PREFIX = 'g4os.';

function countSeenNews(): number {
  try {
    const raw = localStorage.getItem(SEEN_NEWS_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function PreferencesCategoryContainer() {
  const { t } = useTranslate();
  const [seenCount, setSeenCount] = useState(() => countSeenNews());

  const onResetSeenNews = useCallback(() => {
    localStorage.removeItem(SEEN_NEWS_STORAGE_KEY);
    setSeenCount(0);
    toast.success(t('settings.preferences.news.resetDone'));
    void queryClient.invalidateQueries({ queryKey: ['news'] });
  }, [t]);

  const onResetAll = useCallback(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFERENCES_STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
    setSeenCount(0);
    toast.success(t('settings.preferences.resetAll.done', { count: keys.length }));
    void queryClient.invalidateQueries({ queryKey: ['news'] });
  }, [t]);

  return (
    <PreferencesCategory
      seenNewsCount={seenCount}
      onResetSeenNews={onResetSeenNews}
      onResetAll={onResetAll}
    />
  );
}
