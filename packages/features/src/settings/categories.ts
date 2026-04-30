/**
 * Settings categories.
 *
 * Paridade com V1 (12 categorias). Cada categoria tem:
 *  - `id` estável para URL (`/settings/:category`)
 *  - `labelKey` / `descriptionKey` — translation keys
 *  - `status`: 'ready' (tem form funcional) ou 'planned' (placeholder com
 *    badge "Em breve")
 *  - `persistence` — onde o dado grava (App → `config.json`, Workspace →
 *    `workspaces/{id}/config.json`, etc.). Documentação apenas, não
 *    enforçada em código.
 */

import type { TranslationKey } from '@g4os/translate';
import {
  Bot,
  Briefcase,
  CloudUpload,
  Keyboard,
  type LucideIcon,
  Palette,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Type,
  Wrench,
  Zap,
} from 'lucide-react';

export type SettingsCategoryId =
  | 'app'
  | 'agents'
  | 'appearance'
  | 'input'
  | 'workspace'
  | 'usage'
  | 'permissions'
  | 'tags'
  | 'cloud-sync'
  | 'repair'
  | 'shortcuts'
  | 'preferences';

export type SettingsCategoryStatus = 'ready' | 'planned';

export type SettingsPersistence =
  | 'app-config'
  | 'preferences'
  | 'workspace-config'
  | 'workspace-labels'
  | 'workspace-permissions'
  | 'none';

export interface SettingsCategory {
  readonly id: SettingsCategoryId;
  readonly icon: LucideIcon;
  readonly labelKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly status: SettingsCategoryStatus;
  readonly persistence: SettingsPersistence;
}

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    id: 'app',
    icon: SettingsIcon,
    labelKey: 'settings.category.app.label',
    descriptionKey: 'settings.category.app.description',
    status: 'ready',
    persistence: 'app-config',
  },
  {
    id: 'agents',
    icon: Bot,
    labelKey: 'settings.category.agents.label',
    descriptionKey: 'settings.category.agents.description',
    status: 'ready',
    persistence: 'app-config',
  },
  {
    id: 'appearance',
    icon: Palette,
    labelKey: 'settings.category.appearance.label',
    descriptionKey: 'settings.category.appearance.description',
    status: 'ready',
    persistence: 'preferences',
  },
  {
    id: 'input',
    icon: Type,
    labelKey: 'settings.category.input.label',
    descriptionKey: 'settings.category.input.description',
    status: 'ready',
    persistence: 'preferences',
  },
  {
    id: 'workspace',
    icon: Briefcase,
    labelKey: 'settings.category.workspace.label',
    descriptionKey: 'settings.category.workspace.description',
    status: 'ready',
    persistence: 'workspace-config',
  },
  {
    id: 'usage',
    icon: Zap,
    labelKey: 'settings.category.usage.label',
    descriptionKey: 'settings.category.usage.description',
    status: 'ready',
    persistence: 'none',
  },
  {
    id: 'permissions',
    icon: ShieldCheck,
    labelKey: 'settings.category.permissions.label',
    descriptionKey: 'settings.category.permissions.description',
    status: 'ready',
    persistence: 'workspace-permissions',
  },
  {
    id: 'tags',
    icon: Tag,
    labelKey: 'settings.category.tags.label',
    descriptionKey: 'settings.category.tags.description',
    status: 'ready',
    persistence: 'workspace-labels',
  },
  {
    id: 'cloud-sync',
    icon: CloudUpload,
    labelKey: 'settings.category.cloudSync.label',
    descriptionKey: 'settings.category.cloudSync.description',
    status: 'ready',
    persistence: 'app-config',
  },
  {
    id: 'repair',
    icon: Wrench,
    labelKey: 'settings.category.repair.label',
    descriptionKey: 'settings.category.repair.description',
    status: 'ready',
    persistence: 'none',
  },
  {
    id: 'shortcuts',
    icon: Keyboard,
    labelKey: 'settings.category.shortcuts.label',
    descriptionKey: 'settings.category.shortcuts.description',
    status: 'ready',
    persistence: 'none',
  },
  {
    id: 'preferences',
    icon: SlidersHorizontal,
    labelKey: 'settings.category.preferences.label',
    descriptionKey: 'settings.category.preferences.description',
    status: 'ready',
    persistence: 'preferences',
  },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategoryId = 'agents';

export const SETTINGS_CATEGORY_IDS: ReadonlySet<SettingsCategoryId> = new Set(
  SETTINGS_CATEGORIES.map((c) => c.id),
);

export function isSettingsCategoryId(value: string): value is SettingsCategoryId {
  return SETTINGS_CATEGORY_IDS.has(value as SettingsCategoryId);
}

export function findSettingsCategory(id: string): SettingsCategory | null {
  return SETTINGS_CATEGORIES.find((c) => c.id === id) ?? null;
}
