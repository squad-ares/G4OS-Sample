/**
 * Seen news tracking — persistido em `localStorage` sob a chave
 * `g4os.news.seenIds`. Renderer-only (sub-sidebar + detail page
 * compartilham estado via evento custom + storage event).
 */

import { useEffect, useState } from 'react';

const SEEN_STORAGE_KEY = 'g4os.news.seenIds';
const CHANGE_EVENT = 'g4os:news:seen-changed';

function load(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function persist(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...ids]));
    globalThis.window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* tolerar storage indisponível */
  }
}

export function markAsSeen(id: string): void {
  const current = load();
  if (current.has(id)) return;
  const next = new Set(current);
  next.add(id);
  persist(next);
}

export function useSeenNewsIds(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => load());
  useEffect(() => {
    const update = () => setIds(load());
    globalThis.window.addEventListener(CHANGE_EVENT, update);
    globalThis.window.addEventListener('storage', update);
    return () => {
      globalThis.window.removeEventListener(CHANGE_EVENT, update);
      globalThis.window.removeEventListener('storage', update);
    };
  }, []);
  return ids;
}
