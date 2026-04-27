import type { Workspace } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';

export const WORKSPACE_WIZARD_STEPS = [
  'name',
  'working-dir',
  'defaults',
  'sources',
  'style',
  'finish',
] as const;

export type WorkspaceWizardStep = (typeof WORKSPACE_WIZARD_STEPS)[number];

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = 'medium';

export interface WorkspaceColor {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly hex: string;
}

export const WORKSPACE_COLORS: readonly WorkspaceColor[] = [
  { id: 'indigo', labelKey: 'workspace.colors.indigo', hex: '#6366f1' },
  { id: 'emerald', labelKey: 'workspace.colors.emerald', hex: '#10b981' },
  { id: 'amber', labelKey: 'workspace.colors.amber', hex: '#f59e0b' },
  { id: 'rose', labelKey: 'workspace.colors.rose', hex: '#f43f5e' },
  { id: 'sky', labelKey: 'workspace.colors.sky', hex: '#0ea5e9' },
  { id: 'violet', labelKey: 'workspace.colors.violet', hex: '#8b5cf6' },
];

export type PermissionPreset = 'permissive' | 'balanced' | 'strict';

export interface PermissionPresetConfig {
  readonly id: PermissionPreset;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly mode: Workspace['defaults']['permissionMode'];
}

export const PERMISSION_PRESETS: readonly PermissionPresetConfig[] = [
  {
    id: 'permissive',
    labelKey: 'workspace.permissions.preset.permissive.label',
    descriptionKey: 'workspace.permissions.preset.permissive.description',
    mode: 'allow-all',
  },
  {
    id: 'balanced',
    labelKey: 'workspace.permissions.preset.balanced.label',
    descriptionKey: 'workspace.permissions.preset.balanced.description',
    mode: 'ask',
  },
  {
    id: 'strict',
    labelKey: 'workspace.permissions.preset.strict.label',
    descriptionKey: 'workspace.permissions.preset.strict.description',
    mode: 'safe',
  },
];

export interface SourceSeed {
  readonly slug: string;
  readonly labelKey: string;
  readonly group: 'google' | 'microsoft' | 'dev' | 'other';
}

export const DEFAULT_SOURCE_SEEDS: readonly SourceSeed[] = [
  { slug: 'g4tools', labelKey: 'workspace.sources.seed.g4tools', group: 'other' },
  { slug: 'g4os-gmail', labelKey: 'workspace.sources.seed.gmail', group: 'google' },
  { slug: 'g4os-google-calendar', labelKey: 'workspace.sources.seed.gcal', group: 'google' },
  { slug: 'g4os-google-drive', labelKey: 'workspace.sources.seed.gdrive', group: 'google' },
  { slug: 'g4os-slack', labelKey: 'workspace.sources.seed.slack', group: 'other' },
  { slug: 'g4os-github', labelKey: 'workspace.sources.seed.github', group: 'dev' },
  { slug: 'g4os-linear', labelKey: 'workspace.sources.seed.linear', group: 'dev' },
];
