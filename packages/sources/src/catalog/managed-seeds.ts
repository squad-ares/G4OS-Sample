/**
 * Catálogo seed de managed connectors disponíveis pra enable em qualquer
 * workspace. Paridade com V1: Google (gmail/calendar/drive/etc.), Microsoft,
 * Slack, GitHub, Linear, etc.
 *
 * Cada entrada descreve metadata pro UI — a implementação concreta do
 * conector (class extends ManagedConnectorBase) vem em tasks seguintes
 * (TASK-OUTLIER-10). Por enquanto as managed sources aparecem no catálogo
 * mas não respondem a `activate()` — ficam em status `disconnected`.
 */

import type { SourceCatalogItem } from '@g4os/kernel/types';

type CatalogSeed = Omit<SourceCatalogItem, 'isInstalled'>;

const SEEDS: readonly CatalogSeed[] = [
  {
    slug: 'g4os-gmail',
    kind: 'managed',
    displayName: 'Gmail',
    description: 'Gerencie e-mails do Gmail diretamente pelas sessões.',
    descriptionKey: 'sources.catalog.seed.gmail.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-google-calendar',
    kind: 'managed',
    displayName: 'Google Calendar',
    description: 'Consulte e crie eventos no Google Calendar.',
    descriptionKey: 'sources.catalog.seed.googleCalendar.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-google-drive',
    kind: 'managed',
    displayName: 'Google Drive',
    description: 'Leia e escreva arquivos no Google Drive.',
    descriptionKey: 'sources.catalog.seed.googleDrive.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-google-docs',
    kind: 'managed',
    displayName: 'Google Docs',
    description: 'Edição e leitura de documentos Google Docs.',
    descriptionKey: 'sources.catalog.seed.googleDocs.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-google-sheets',
    kind: 'managed',
    displayName: 'Google Sheets',
    description: 'Consultas e atualizações em planilhas Google Sheets.',
    descriptionKey: 'sources.catalog.seed.googleSheets.description',
    category: 'google',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-outlook-email',
    kind: 'managed',
    displayName: 'Outlook',
    description: 'Gerencie e-mails do Outlook/Microsoft 365.',
    descriptionKey: 'sources.catalog.seed.outlook.description',
    category: 'microsoft',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-outlook-calendar',
    kind: 'managed',
    displayName: 'Outlook Calendar',
    description: 'Consulte e crie eventos no Outlook Calendar.',
    descriptionKey: 'sources.catalog.seed.outlookCalendar.description',
    category: 'microsoft',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-microsoft-teams',
    kind: 'managed',
    displayName: 'Microsoft Teams',
    description: 'Interaja com canais e mensagens do Teams.',
    descriptionKey: 'sources.catalog.seed.microsoftTeams.description',
    category: 'microsoft',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-slack',
    kind: 'managed',
    displayName: 'Slack',
    description: 'Envie e leia mensagens em canais Slack.',
    descriptionKey: 'sources.catalog.seed.slack.description',
    category: 'slack',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-github',
    kind: 'managed',
    displayName: 'GitHub',
    description: 'Consulte issues, PRs, reviews e repositórios.',
    descriptionKey: 'sources.catalog.seed.github.description',
    category: 'dev',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-linear',
    kind: 'managed',
    displayName: 'Linear',
    description: 'Gestão de issues e projetos no Linear.',
    descriptionKey: 'sources.catalog.seed.linear.description',
    category: 'pm',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-jira',
    kind: 'managed',
    displayName: 'Jira',
    description: 'Issues, sprints e backlog no Jira.',
    descriptionKey: 'sources.catalog.seed.jira.description',
    category: 'pm',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-asana',
    kind: 'managed',
    displayName: 'Asana',
    description: 'Tarefas e projetos no Asana.',
    descriptionKey: 'sources.catalog.seed.asana.description',
    category: 'pm',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-pipedrive',
    kind: 'managed',
    displayName: 'Pipedrive',
    description: 'CRM Pipedrive — leads, deals e contatos.',
    descriptionKey: 'sources.catalog.seed.pipedrive.description',
    category: 'crm',
    authKind: 'oauth',
  },
  {
    slug: 'g4os-trello',
    kind: 'managed',
    displayName: 'Trello',
    description: 'Boards, listas e cards no Trello.',
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
