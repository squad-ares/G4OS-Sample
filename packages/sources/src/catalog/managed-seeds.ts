/**
 * Catálogo seed de managed connectors disponíveis pra enable em qualquer
 * workspace. Paridade com V1: Google (gmail/calendar/drive/etc.), Microsoft,
 * Slack, GitHub, Linear, etc.
 *
 * Cada entrada descreve metadata pro UI — a implementação concreta do
 * conector (class extends ManagedConnectorBase) vem em tasks seguintes
 * Por enquanto as managed sources aparecem no catálogo
 * mas não respondem a `activate()` — ficam em status `disconnected`.
 */

import type { SourceCatalogItem } from '@g4os/kernel/types';

type CatalogSeed = Omit<SourceCatalogItem, 'isInstalled'>;

const SEEDS: readonly CatalogSeed[] = [
  {
    slug: 'g4os-gmail',
    kind: 'managed',
    displayName: 'Gmail',
    descriptionKey: 'sources.catalog.seed.gmail.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-google-calendar',
    kind: 'managed',
    displayName: 'Google Calendar',
    descriptionKey: 'sources.catalog.seed.googleCalendar.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-google-drive',
    kind: 'managed',
    displayName: 'Google Drive',
    descriptionKey: 'sources.catalog.seed.googleDrive.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-google-docs',
    kind: 'managed',
    displayName: 'Google Docs',
    descriptionKey: 'sources.catalog.seed.googleDocs.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-google-sheets',
    kind: 'managed',
    displayName: 'Google Sheets',
    descriptionKey: 'sources.catalog.seed.googleSheets.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-outlook-email',
    kind: 'managed',
    displayName: 'Outlook',
    descriptionKey: 'sources.catalog.seed.outlook.description',
    category: 'microsoft',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-outlook-calendar',
    kind: 'managed',
    displayName: 'Outlook Calendar',
    descriptionKey: 'sources.catalog.seed.outlookCalendar.description',
    category: 'microsoft',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-microsoft-teams',
    kind: 'managed',
    displayName: 'Microsoft Teams',
    descriptionKey: 'sources.catalog.seed.microsoftTeams.description',
    category: 'microsoft',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-slack',
    kind: 'managed',
    displayName: 'Slack',
    descriptionKey: 'sources.catalog.seed.slack.description',
    category: 'slack',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-github',
    kind: 'managed',
    displayName: 'GitHub',
    descriptionKey: 'sources.catalog.seed.github.description',
    category: 'dev',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-linear',
    kind: 'managed',
    displayName: 'Linear',
    descriptionKey: 'sources.catalog.seed.linear.description',
    category: 'pm',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-jira',
    kind: 'managed',
    displayName: 'Jira',
    descriptionKey: 'sources.catalog.seed.jira.description',
    category: 'pm',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-asana',
    kind: 'managed',
    displayName: 'Asana',
    descriptionKey: 'sources.catalog.seed.asana.description',
    category: 'pm',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-pipedrive',
    kind: 'managed',
    displayName: 'Pipedrive',
    descriptionKey: 'sources.catalog.seed.pipedrive.description',
    category: 'crm',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-trello',
    kind: 'managed',
    displayName: 'Trello',
    descriptionKey: 'sources.catalog.seed.trello.description',
    category: 'pm',
    authKind: 'oauth',
  },
];

/** Retorna o catálogo com flag `isInstalled` baseado nos slugs ativos. */
export function buildCatalog(installedSlugs: ReadonlySet<string>): readonly SourceCatalogItem[] {
  return SEEDS.map((seed) => ({
    ...seed,
    isInstalled: installedSlugs.has(seed.slug),
  }));
}

/** Metadata de um slug conhecido do catálogo. `null` se custom. */
export function catalogEntry(slug: string): CatalogSeed | null {
  return SEEDS.find((s) => s.slug === slug) ?? null;
}

export { SEEDS as MANAGED_CATALOG_SEEDS };
