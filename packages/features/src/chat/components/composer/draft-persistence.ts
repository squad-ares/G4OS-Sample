export interface DraftStore {
  load(sessionId: string): string;
  save(sessionId: string, text: string): void;
  clear(sessionId: string): void;
}

const STORAGE_PREFIX = 'g4os:draft:';

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

function getStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const localStorageDraftStore: DraftStore = {
  load(sessionId) {
    const storage = getStorage();
    if (!storage) return '';
    try {
      return storage.getItem(storageKey(sessionId)) ?? '';
    } catch {
      return '';
    }
  },
  save(sessionId, text) {
    const storage = getStorage();
    if (!storage) return;
    try {
      if (text.trim().length === 0) {
        storage.removeItem(storageKey(sessionId));
      } else {
        storage.setItem(storageKey(sessionId), text);
      }
    } catch {
      // storage quota / disabled — drop silently, drafts are best-effort
    }
  },
  clear(sessionId) {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.removeItem(storageKey(sessionId));
    } catch {
      // best-effort
    }
  },
};
