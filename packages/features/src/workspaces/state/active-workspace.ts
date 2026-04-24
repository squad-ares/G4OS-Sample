import { useSyncExternalStore } from 'react';

export const ACTIVE_WORKSPACE_STORAGE_KEY = 'g4os.active-workspace-id';

type Listener = () => void;

const listeners = new Set<Listener>();

function readFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToStorage(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, value);
    }
  } catch {
    // storage unavailable; fall back to in-memory only
  }
}

let cachedValue: string | null = readFromStorage();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return cachedValue;
}

function getServerSnapshot(): string | null {
  return null;
}

export function useActiveWorkspaceId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useSetActiveWorkspaceId(): (id: string | null) => void {
  return setActiveWorkspaceId;
}

function setActiveWorkspaceId(id: string | null): void {
  if (cachedValue === id) return;
  cachedValue = id;
  writeToStorage(id);
  for (const listener of listeners) listener();
}
