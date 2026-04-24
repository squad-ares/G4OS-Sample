import type { TranslationKey } from '@g4os/translate';
import {
  FolderKanban,
  type LucideIcon,
  MessagesSquare,
  Newspaper,
  Plug,
  Settings,
  Store,
  Workflow,
} from 'lucide-react';

/**
 * Primary sidebar structure — exactly 7 top-level hubs (V1 parity):
 *   Sessions, Projects, Connections, Automations, Marketplace, News, Settings.
 *
 * Sub-features are exposed inside each hub's contextual sub-sidebar, not as
 * rail entries. For example: Sources/MCPs/APIs/Local-folders/Agents live
 * inside `connections`; Skills/Scheduler/Workflows/Vigias live inside
 * `automations`; Labels/Permissions/Cloud-Sync/Preferences live inside
 * `settings`.
 */
export type ShellNavigationId =
  | 'sessions'
  | 'projects'
  | 'connections'
  | 'automations'
  | 'marketplace'
  | 'news'
  | 'settings';

export type ShellNavigationSection = 'workspace' | 'automation' | 'system';
export type ShellNavigationStatus = 'ready' | 'planned';

export interface ShellNavigationEntry {
  readonly id: ShellNavigationId;
  readonly section: ShellNavigationSection;
  readonly to: string;
  readonly labelKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly status: ShellNavigationStatus;
  readonly icon: LucideIcon;
}

export const shellNavigationEntries: readonly ShellNavigationEntry[] = [
  {
    id: 'sessions',
    section: 'workspace',
    to: '/workspaces',
    labelKey: 'shell.nav.sessions.label',
    descriptionKey: 'shell.nav.sessions.description',
    status: 'ready',
    icon: MessagesSquare,
  },
  {
    id: 'projects',
    section: 'workspace',
    to: '/projects',
    labelKey: 'shell.nav.projects.label',
    descriptionKey: 'shell.nav.projects.description',
    status: 'ready',
    icon: FolderKanban,
  },
  {
    id: 'connections',
    section: 'workspace',
    to: '/connections',
    labelKey: 'shell.nav.connections.label',
    descriptionKey: 'shell.nav.connections.description',
    status: 'planned',
    icon: Plug,
  },
  {
    id: 'automations',
    section: 'automation',
    to: '/automations',
    labelKey: 'shell.nav.automations.label',
    descriptionKey: 'shell.nav.automations.description',
    status: 'planned',
    icon: Workflow,
  },
  {
    id: 'marketplace',
    section: 'workspace',
    to: '/marketplace',
    labelKey: 'shell.nav.marketplace.label',
    descriptionKey: 'shell.nav.marketplace.description',
    status: 'planned',
    icon: Store,
  },
  {
    id: 'news',
    section: 'system',
    to: '/news',
    labelKey: 'shell.nav.news.label',
    descriptionKey: 'shell.nav.news.description',
    status: 'ready',
    icon: Newspaper,
  },
  {
    id: 'settings',
    section: 'system',
    to: '/settings',
    labelKey: 'shell.nav.settings.label',
    descriptionKey: 'shell.nav.settings.description',
    status: 'ready',
    icon: Settings,
  },
] as const;

export function resolveShellNavigation(pathname: string): ShellNavigationEntry | undefined {
  return shellNavigationEntries
    .slice()
    .sort((left, right) => right.to.length - left.to.length)
    .find((entry) => pathname === entry.to || pathname.startsWith(`${entry.to}/`));
}

export function getShellNavigationEntry(id: ShellNavigationId): ShellNavigationEntry {
  const entry = shellNavigationEntries.find((item) => item.id === id);
  if (!entry) {
    throw new Error(`Shell navigation entry not found: ${id}`);
  }
  return entry;
}
