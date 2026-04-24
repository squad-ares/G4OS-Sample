export {
  formatShortcut,
  type ShellActionBinding,
  type ShellActionDefinition,
  shellActionDefinitions,
} from './actions.ts';
export { AppShell, type AppShellProps } from './components/app-shell.tsx';
export {
  ShellCommandPalette,
  type ShellCommandPaletteProps,
} from './components/shell-command-palette.tsx';
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
export {
  ContextualSubSidebar,
  type ContextualSubSidebarProps,
} from './components/sub-sidebar/contextual-sub-sidebar.tsx';
export {
  PlaceholderPanel,
  type PlaceholderPanelProps,
} from './components/sub-sidebar/placeholder-panel.tsx';
export {
  ProjectsPanel,
  type ProjectsPanelProps,
} from './components/sub-sidebar/projects-panel.tsx';
export {
  mapSessionToPanelItem,
  SessionsPanel,
  type SessionsPanelProps,
  type SessionsPanelSessionItem,
  type SessionsSubTab,
} from './components/sub-sidebar/sessions-panel.tsx';
export {
  SubSidebarFooter,
  type SubSidebarFooterProps,
  type SubSidebarWorkspace,
} from './components/sub-sidebar/sub-sidebar-footer.tsx';
export {
  SubSidebarShell,
  type SubSidebarShellProps,
} from './components/sub-sidebar/sub-sidebar-shell.tsx';
export { WorkspaceSidebar, type WorkspaceSidebarProps } from './components/workspace-sidebar.tsx';
export { useGlobalShortcuts } from './hooks/use-global-shortcuts.ts';
export {
  getShellNavigationEntry,
  resolveShellNavigation,
  type ShellNavigationEntry,
  type ShellNavigationId,
  shellNavigationEntries,
} from './navigation.ts';
