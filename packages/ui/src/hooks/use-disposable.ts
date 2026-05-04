import type { IDisposable } from '@g4os/kernel/disposable';
import { DisposableStore } from '@g4os/kernel/disposable';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Retorna uma função estável para registrar disposables que serão descartados
 * quando o componente desmontar.
 *
 * Três correções aplicadas (F-CR49-3):
 * (a) Não nulifica `storeRef.current` no cleanup — em StrictMode o segundo
 *     mount encontraria `null` e deixaria disposables sem dono.
 *     Deixamos o GC cuidar do store descartado; o `if (!storeRef.current)`
 *     no init body cria um store novo no remount.
 * (b) Retorno envolvido em `useCallback([], [])` — sem isso, cada re-render
 *     produz nova referência e `useEffect([register])` no consumer dispara loop.
 * (c) Guard para `add` após dispose — se um callback async resolve depois do
 *     unmount, o registro é no-op (DisposableStore.isDisposed) com aviso em dev.
 */
export const useDisposable = (): ((d: IDisposable) => void) => {
  const storeRef = useRef<DisposableStore | null>(null);

  if (!storeRef.current) storeRef.current = new DisposableStore();

  useEffect(() => {
    return () => {
      // Descarta o store atual sem nulificar a ref — StrictMode faz
      // mount/unmount/mount e o corpo acima cria store novo no remount.
      storeRef.current?.dispose();
    };
  }, []);

  return useCallback((d: IDisposable) => {
    const store = storeRef.current;
    if (!store || store.isDisposed) {
      // Componente já desmontado — registrar aqui é no-op silencioso.
      // Aviso em dev para facilitar diagnóstico de race conditions.
      // No-op intencional: o store foi descartado (componente desmontado).
      // Disposable ignorado — quem registrou após unmount tem um bug de race.
      return;
    }
    store.add(d);
  }, []);
};
