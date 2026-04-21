export {
  formatShortcut,
  type ShellActionBinding,
  type ShellActionDefinition,
  shellActionDefinitions,
} from './actions.ts';
export { AppHeader, type AppHeaderProps } from './components/app-header.tsx';
export { AppShell, type AppShellProps } from './components/app-shell.tsx';
export {
  ShellCommandPalette,
  type ShellCommandPaletteProps,
} from './components/shell-command-palette.tsx';
export {
  ShellNavigator,
  type ShellNavigatorProps,
  type ShellNavigatorWorkspace,
} from './components/shell-navigator.tsx';
export {
  ShellErrorState,
  ShellLoadingState,
  ShellPageScaffold,
  type ShellPageScaffoldProps,
  ShellPlaceholderPage,
  ShellStatusPanel,
  type ShellStatusPanelProps,
  ShortcutsList,
} from './components/shell-page.tsx';
export {
  ShellShortcutsDialog,
  type ShellShortcutsDialogProps,
} from './components/shell-shortcuts-dialog.tsx';
export { WorkspaceSidebar, type WorkspaceSidebarProps } from './components/workspace-sidebar.tsx';
export { useGlobalShortcuts } from './hooks/use-global-shortcuts.ts';
export {
  getShellNavigationEntry,
  resolveShellNavigation,
  type ShellNavigationEntry,
  type ShellNavigationId,
  shellNavigationEntries,
} from './navigation.ts';
