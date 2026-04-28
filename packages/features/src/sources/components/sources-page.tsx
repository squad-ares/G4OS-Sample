import type {
  CreateMcpStdioSourceInput,
  SourceCatalogItem,
  SourceConfigView,
} from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { Button, StatusPanel, useTranslate } from '@g4os/ui';
import { CheckCircle2, Grid2X2, Plug, Plus, Search, Server } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ShellPageScaffold } from '../../shell/index.ts';
import { CatalogItemCard } from './catalog-item.tsx';
import { CreateStdioDialog } from './create-stdio-dialog.tsx';
import { SourceCard } from './source-card.tsx';

export interface SourcesPageProps {
  readonly workspaceId: string;
  readonly sources: readonly SourceConfigView[];
  readonly catalog: readonly SourceCatalogItem[];
  readonly onEnableManaged: (slug: string) => Promise<void>;
  readonly onCreateStdio: (input: CreateMcpStdioSourceInput) => Promise<void>;
  readonly onToggle: (id: string, enabled: boolean) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onTest?: (id: string) => Promise<void>;
  readonly testingId?: string;
  readonly loading?: boolean;
  readonly mutating?: boolean;
}

type SourcesTab = 'all' | 'installed' | 'catalog' | 'custom';

export function SourcesPage({
  workspaceId,
  sources,
  catalog,
  onEnableManaged,
  onCreateStdio,
  onToggle,
  onDelete,
  onTest,
  testingId,
  loading,
  mutating,
}: SourcesPageProps) {
  const { t } = useTranslate();
  const [stdioDialogOpen, setStdioDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SourcesTab>('all');

  const filteredSources = useMemo(
    () =>
      sources.filter((source) => {
        if (activeTab === 'catalog') return false;
        if (activeTab === 'custom' && source.kind !== 'mcp-stdio' && source.kind !== 'mcp-http') {
          return false;
        }
        return matchesQuery(
          {
            category: source.category,
            description: source.description,
            displayName: source.displayName,
            slug: source.slug,
          },
          query,
        );
      }),
    [activeTab, query, sources],
  );
  const filteredCatalog = useMemo(
    () =>
      catalog.filter((item) => {
        if (activeTab === 'installed') return false;
        if (activeTab === 'custom') return false;
        return matchesQuery(
          {
            category: item.category,
            description: item.description,
            displayName: item.displayName,
            slug: item.slug,
          },
          query,
        );
      }),
    [activeTab, catalog, query],
  );
  const grouped = useMemo(() => groupByCategory(filteredCatalog), [filteredCatalog]);

  return (
    <ShellPageScaffold
      eyebrow={t('sources.page.eyebrow')}
      title={t('sources.page.title')}
      description={t('sources.page.description')}
    >
      <div className="flex flex-col gap-3 rounded-lg border border-foreground/10 bg-background px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden={true}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('sources.search.placeholder')}
              className="h-9 w-full rounded-md border border-foreground/10 bg-foreground/[0.02] pl-9 pr-3 text-sm outline-none transition focus:border-foreground/25"
            />
          </div>
          <Button onClick={() => setStdioDialogOpen(true)} size="sm" className="gap-1.5">
            <Plus className="size-4" aria-hidden={true} />
            {t('sources.page.addCustom')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {SOURCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                  selected
                    ? 'border-foreground/20 bg-foreground/10 text-foreground'
                    : 'border-foreground/10 bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-3.5" aria-hidden={true} />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      {activeTab === 'catalog' ? null : (
        <StatusPanel
          title={t('sources.active.title')}
          description={t('sources.active.description', { count: sources.length })}
          badge={t('sources.page.eyebrow')}
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('sources.loading')}</p>
          ) : filteredSources.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
              {filteredSources.map((s) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  onToggle={(next) => void onToggle(s.id, next)}
                  onDelete={() => void onDelete(s.id)}
                  {...(onTest ? { onTest: () => void onTest(s.id) } : {})}
                  testing={testingId === s.id}
                  disabled={mutating === true}
                />
              ))}
            </ul>
          )}
        </StatusPanel>
      )}

      {activeTab === 'all' || activeTab === 'catalog' ? (
        <StatusPanel
          title={t('sources.catalog.title')}
          description={t('sources.catalog.description')}
        >
          <div className="flex flex-col gap-5">
            {Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category} className="flex flex-col gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t(`sources.category.${category}` as TranslationKey)}
                </h3>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <CatalogItemCard
                      key={item.slug}
                      item={item}
                      onEnable={() => void onEnableManaged(item.slug)}
                      disabled={mutating === true}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {grouped.size === 0 ? (
              <p className="rounded-lg border border-dashed border-foreground/10 px-4 py-6 text-center text-sm text-muted-foreground">
                {t('sources.catalog.emptySearch')}
              </p>
            ) : null}
          </div>
        </StatusPanel>
      ) : null}

      <CreateStdioDialog
        workspaceId={workspaceId}
        open={stdioDialogOpen}
        onOpenChange={setStdioDialogOpen}
        onSubmit={async (input) => {
          await onCreateStdio(input);
          setStdioDialogOpen(false);
        }}
      />
    </ShellPageScaffold>
  );
}

const SOURCE_TABS: readonly {
  readonly id: SourcesTab;
  readonly labelKey: TranslationKey;
  readonly icon: typeof Grid2X2;
}[] = [
  { id: 'all', labelKey: 'sources.tab.all', icon: Grid2X2 },
  { id: 'installed', labelKey: 'sources.tab.installed', icon: CheckCircle2 },
  { id: 'catalog', labelKey: 'sources.tab.catalog', icon: Plug },
  { id: 'custom', labelKey: 'sources.tab.custom', icon: Server },
];

function EmptyState() {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-foreground/10 px-6 py-8 text-center">
      <Plug className="size-8 text-muted-foreground/50" aria-hidden={true} />
      <p className="text-sm font-medium">{t('sources.active.emptyTitle')}</p>
      <p className="text-xs text-muted-foreground">{t('sources.active.emptyDescription')}</p>
    </div>
  );
}

function groupByCategory(
  items: readonly SourceCatalogItem[],
): ReadonlyMap<string, readonly SourceCatalogItem[]> {
  const map = new Map<string, SourceCatalogItem[]>();
  for (const item of items) {
    const existing = map.get(item.category);
    if (existing) existing.push(item);
    else map.set(item.category, [item]);
  }
  return map;
}

function matchesQuery(
  item: {
    readonly category: string;
    readonly description: string | undefined;
    readonly displayName: string;
    readonly slug: string;
  },
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${item.displayName} ${item.slug} ${item.category} ${item.description ?? ''}`
    .toLowerCase()
    .includes(normalized);
}
