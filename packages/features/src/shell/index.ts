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
  type AutomationKind,
  type AutomationPanelItem,
  AutomationsPanel,
  type AutomationsPanelProps,
} from './components/sub-sidebar/automations-panel.tsx';
export {
  ContextualSubSidebar,
  type ContextualSubSidebarProps,
} from './components/sub-sidebar/contextual-sub-sidebar.tsx';
export {
  MarketplacePanel,
  type MarketplacePanelItem,
  type MarketplacePanelProps,
} from './components/sub-sidebar/marketplace-panel.tsx';
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
// CR-18 F-F5: re-export HighlightedTitle como utilitário horizontal pra
// projects/sources cards usarem search inline highlight (CLAUDE.md "Search
// inline em listas") sem duplicar implementação.
export { HighlightedTitle } from './components/sub-sidebar/sessions-panel-states.tsx';
export {
  SourcesPanel,
  type SourcesPanelProps,
} from './components/sub-sidebar/sources-panel.tsx';
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
