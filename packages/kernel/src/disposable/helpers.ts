import type { IDisposable } from './types.ts';

export function toDisposable(fn: () => void): IDisposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      fn();
    },
  };
}

export function combinedDisposable(...disposables: IDisposable[]): IDisposable {
  return toDisposable(() => {
    for (const d of disposables) {
      try {
        d.dispose();
      } catch {
        // best-effort
      }
    }
  });
}

/** Descarta automaticamente se AbortSignal for abortado */
export function bindToAbort(disposable: IDisposable, signal: AbortSignal): IDisposable {
  if (signal.aborted) {
    disposable.dispose();
    return disposable;
  }
  let disposed = false;
  const onAbort = () => {
    if (disposed) return;
    disposed = true;
    disposable.dispose();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  return toDisposable(() => {
    signal.removeEventListener('abort', onAbort);
    if (disposed) return;
    disposed = true;
    disposable.dispose();
  });
}
