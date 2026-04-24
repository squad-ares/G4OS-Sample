import { useEffect, useEffectEvent } from 'react';

export interface WorkspaceShortcutBinding {
  readonly index: number;
  readonly workspaceId: string;
  readonly onActivate: (id: string) => void;
}

/**
 * Binds Cmd/Ctrl+1..9 to workspace switching.
 *
 * Lives outside the generic shell shortcut engine because the binding set is
 * dynamic (depends on workspace list order) and should not be registered via
 * static `ShellActionDefinition`.
 */
export function useWorkspaceShortcuts(bindings: readonly WorkspaceShortcutBinding[]): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (shouldIgnoreHotkey(event)) return;
    if (!event.metaKey && !event.ctrlKey) return;
    if (event.shiftKey || event.altKey) return;

    const digit = Number.parseInt(event.key, 10);
    if (Number.isNaN(digit) || digit < 1 || digit > 9) return;

    const target = bindings.find((binding) => binding.index === digit);
    if (!target) return;

    event.preventDefault();
    target.onActivate(target.workspaceId);
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

function shouldIgnoreHotkey(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
