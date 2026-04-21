import type { TranslationKey } from '@g4os/translate';

export type ShellNavigationId =
  | 'workspaces'
  | 'sources'
  | 'projects'
  | 'marketplace'
  | 'company-context'
  | 'skills'
  | 'workflows'
  | 'scheduler'
  | 'vigia'
  | 'news'
  | 'settings'
  | 'support';

export type ShellNavigationSection = 'workspace' | 'automation' | 'system';
export type ShellNavigationStatus = 'ready' | 'planned';

export interface ShellNavigationEntry {
  readonly id: ShellNavigationId;
  readonly section: ShellNavigationSection;
  readonly to: string;
  readonly labelKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly status: ShellNavigationStatus;
}

export const shellNavigationEntries: readonly ShellNavigationEntry[] = [
  {
    id: 'workspaces',
    section: 'workspace',
    to: '/workspaces',
    labelKey: 'shell.nav.workspaces.label',
    descriptionKey: 'shell.nav.workspaces.description',
    status: 'ready',
  },
  {
    id: 'sources',
    section: 'workspace',
    to: '/sources',
    labelKey: 'shell.nav.sources.label',
    descriptionKey: 'shell.nav.sources.description',
    status: 'planned',
  },
  {
    id: 'projects',
    section: 'workspace',
    to: '/projects',
    labelKey: 'shell.nav.projects.label',
    descriptionKey: 'shell.nav.projects.description',
    status: 'planned',
  },
  {
    id: 'marketplace',
    section: 'workspace',
    to: '/marketplace',
    labelKey: 'shell.nav.marketplace.label',
    descriptionKey: 'shell.nav.marketplace.description',
    status: 'planned',
  },
  {
    id: 'company-context',
    section: 'automation',
    to: '/company-context',
    labelKey: 'shell.nav.companyContext.label',
    descriptionKey: 'shell.nav.companyContext.description',
    status: 'planned',
  },
  {
    id: 'skills',
    section: 'automation',
    to: '/skills',
    labelKey: 'shell.nav.skills.label',
    descriptionKey: 'shell.nav.skills.description',
    status: 'planned',
  },
  {
    id: 'workflows',
    section: 'automation',
    to: '/workflows',
    labelKey: 'shell.nav.workflows.label',
    descriptionKey: 'shell.nav.workflows.description',
    status: 'planned',
  },
  {
    id: 'scheduler',
    section: 'automation',
    to: '/scheduler',
    labelKey: 'shell.nav.scheduler.label',
    descriptionKey: 'shell.nav.scheduler.description',
    status: 'planned',
  },
  {
    id: 'vigia',
    section: 'automation',
    to: '/vigia',
    labelKey: 'shell.nav.vigia.label',
    descriptionKey: 'shell.nav.vigia.description',
    status: 'planned',
  },
  {
    id: 'news',
    section: 'system',
    to: '/news',
    labelKey: 'shell.nav.news.label',
    descriptionKey: 'shell.nav.news.description',
    status: 'planned',
  },
  {
    id: 'settings',
    section: 'system',
    to: '/settings',
    labelKey: 'shell.nav.settings.label',
    descriptionKey: 'shell.nav.settings.description',
    status: 'ready',
  },
  {
    id: 'support',
    section: 'system',
    to: '/support',
    labelKey: 'shell.nav.support.label',
    descriptionKey: 'shell.nav.support.description',
    status: 'ready',
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
