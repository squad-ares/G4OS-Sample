import type { TranslationKey } from '@g4os/translate';

export type ShellActionSection = 'navigation' | 'workspace' | 'system';

export interface ShellActionDefinition {
  readonly id: string;
  readonly section: ShellActionSection;
  readonly labelKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly shortcut: string;
  readonly intent:
    | { readonly kind: 'dialog'; readonly target: 'command-palette' | 'shortcuts' }
    | { readonly kind: 'navigate'; readonly to: string }
    | { readonly kind: 'session'; readonly target: 'sign-out' };
}

export interface ShellActionBinding {
  readonly definition: ShellActionDefinition;
  readonly enabled?: boolean;
  readonly run: () => void;
}

export const shellActionDefinitions: readonly ShellActionDefinition[] = [
  {
    id: 'command-palette',
    section: 'system',
    labelKey: 'shell.action.commandPalette.label',
    descriptionKey: 'shell.action.commandPalette.description',
    shortcut: 'mod+k',
    intent: { kind: 'dialog', target: 'command-palette' },
  },
  {
    id: 'shortcuts',
    section: 'system',
    labelKey: 'shell.action.shortcuts.label',
    descriptionKey: 'shell.action.shortcuts.description',
    shortcut: 'shift+/',
    intent: { kind: 'dialog', target: 'shortcuts' },
  },
  {
    id: 'go-workspaces',
    section: 'navigation',
    labelKey: 'shell.action.workspaces.label',
    descriptionKey: 'shell.action.workspaces.description',
    shortcut: 'mod+1',
    intent: { kind: 'navigate', to: '/workspaces' },
  },
  {
    id: 'go-sources',
    section: 'navigation',
    labelKey: 'shell.action.sources.label',
    descriptionKey: 'shell.action.sources.description',
    shortcut: 'mod+2',
    intent: { kind: 'navigate', to: '/sources' },
  },
  {
    id: 'go-projects',
    section: 'navigation',
    labelKey: 'shell.action.projects.label',
    descriptionKey: 'shell.action.projects.description',
    shortcut: 'mod+3',
    intent: { kind: 'navigate', to: '/projects' },
  },
  {
    id: 'go-marketplace',
    section: 'navigation',
    labelKey: 'shell.action.marketplace.label',
    descriptionKey: 'shell.action.marketplace.description',
    shortcut: 'mod+4',
    intent: { kind: 'navigate', to: '/marketplace' },
  },
  {
    id: 'go-settings',
    section: 'system',
    labelKey: 'shell.action.settings.label',
    descriptionKey: 'shell.action.settings.description',
    shortcut: 'mod+,',
    intent: { kind: 'navigate', to: '/settings' },
  },
  {
    id: 'sign-out',
    section: 'workspace',
    labelKey: 'shell.action.signOut.label',
    descriptionKey: 'shell.action.signOut.description',
    shortcut: 'mod+shift+l',
    intent: { kind: 'session', target: 'sign-out' },
  },
] as const;

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+');
  const normalizedKey = normalizeShortcutKey(event.key);
  const expected = {
    meta: parts.includes('meta') || (parts.includes('mod') && isMacPlatform()),
    ctrl: parts.includes('ctrl') || (parts.includes('mod') && !isMacPlatform()),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts.find((part) => !['meta', 'ctrl', 'shift', 'alt', 'mod'].includes(part)),
  };

  return (
    event.metaKey === expected.meta &&
    event.ctrlKey === expected.ctrl &&
    event.shiftKey === expected.shift &&
    event.altKey === expected.alt &&
    normalizedKey === expected.key
  );
}

export function formatShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => formatShortcutPart(part))
    .join(isMacPlatform() ? '' : ' + ');
}

export function shouldIgnoreHotkey(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function normalizeShortcutKey(key: string): string {
  if (key === '?') return '/';
  return key.toLowerCase();
}

function formatShortcutPart(part: string): string {
  if (part === 'mod') return isMacPlatform() ? '⌘' : 'Ctrl';
  if (part === 'shift') return isMacPlatform() ? '⇧' : 'Shift';
  if (part === 'alt') return isMacPlatform() ? '⌥' : 'Alt';
  if (part === 'meta') return '⌘';
  if (part === 'ctrl') return 'Ctrl';
  if (part === ',') return ',';
  return part.toUpperCase();
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toLowerCase().includes('mac');
}
