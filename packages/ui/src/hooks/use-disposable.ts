import type { IDisposable } from '@g4os/kernel/disposable';
import { DisposableStore } from '@g4os/kernel/disposable';
import { useEffect, useRef } from 'react';

export const useDisposable = (): ((d: IDisposable) => void) => {
  const storeRef = useRef<DisposableStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = new DisposableStore();
  }

  useEffect(() => {
    return () => {
      storeRef.current?.dispose();
      storeRef.current = null;
    };
  }, []);

  return (d: IDisposable) => {
    storeRef.current?.add(d);
  };
};
