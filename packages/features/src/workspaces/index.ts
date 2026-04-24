export {
  WorkspaceSetupWizard,
  type WorkspaceSetupWizardDraft,
  type WorkspaceSetupWizardProps,
} from './components/setup-wizard.tsx';
export {
  WorkspaceDeleteDialog,
  type WorkspaceDeleteDialogProps,
  type WorkspaceDeleteOptions,
} from './components/workspace-delete-dialog.tsx';
export {
  WorkspaceListPanel,
  type WorkspaceListPanelProps,
} from './components/workspace-list-panel.tsx';
export {
  WorkspaceSettingsPanel,
  type WorkspaceSettingsPanelProps,
  type WorkspaceSettingsPatch,
} from './components/workspace-settings-panel.tsx';
export {
  WorkspaceSwitcher,
  WorkspaceSwitcherContent,
  type WorkspaceSwitcherContentProps,
  type WorkspaceSwitcherProps,
} from './components/workspace-switcher.tsx';
export { useWorkspaceShortcuts } from './hooks/use-workspace-shortcuts.ts';
export { type ValidationIssue, validateWorkspaceDefaults } from './logic/validate.ts';
export {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  useActiveWorkspaceId,
  useSetActiveWorkspaceId,
} from './state/active-workspace.ts';
export {
  DEFAULT_SOURCE_SEEDS,
  DEFAULT_THINKING_LEVEL,
  PERMISSION_PRESETS,
  type PermissionPreset,
  type PermissionPresetConfig,
  type SourceSeed,
  type ThinkingLevel,
  WORKSPACE_COLORS,
  WORKSPACE_WIZARD_STEPS,
  type WorkspaceColor,
  type WorkspaceWizardStep,
} from './types.ts';
