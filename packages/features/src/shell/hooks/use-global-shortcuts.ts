import { useEffect, useEffectEvent } from 'react';
import { matchesShortcut, type ShellActionBinding, shouldIgnoreHotkey } from '../actions.ts';

export function useGlobalShortcuts(bindings: readonly ShellActionBinding[]): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (shouldIgnoreHotkey(event)) return;

    const match = bindings.find(
      (binding) => binding.enabled !== false && matchesShortcut(event, binding.definition.shortcut),
    );
    if (!match) return;

    event.preventDefault();
    match.run();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };

    globalThis.window.addEventListener('keydown', listener);
    return () => {
      globalThis.window.removeEventListener('keydown', listener);
    };
  }, []);
}
