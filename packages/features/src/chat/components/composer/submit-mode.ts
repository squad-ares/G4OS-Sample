import type { KeyboardEvent } from 'react';

export type ComposerSubmitMode = 'enter' | 'cmd-enter';

export function shouldSubmit(
  event: KeyboardEvent<HTMLTextAreaElement>,
  mode: ComposerSubmitMode,
): boolean {
  if (event.key !== 'Enter') return false;
  if (event.nativeEvent.isComposing) return false;
  if (event.shiftKey) return false;

  if (mode === 'enter') return true;
  return event.metaKey || event.ctrlKey;
}

export function shouldInsertNewline(
  event: KeyboardEvent<HTMLTextAreaElement>,
  mode: ComposerSubmitMode,
): boolean {
  if (event.key !== 'Enter') return false;
  if (event.shiftKey) return true;
  if (mode === 'cmd-enter' && !event.metaKey && !event.ctrlKey) return true;
  return false;
}
