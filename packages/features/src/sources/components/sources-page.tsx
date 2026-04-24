import type {
  CreateMcpStdioSourceInput,
  SourceCatalogItem,
  SourceConfigView,
} from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { Button, useTranslate } from '@g4os/ui';
import { Plug, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ShellPageScaffold, ShellStatusPanel } from '../../shell/index.ts';
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

  const grouped = useMemo(() => groupByCategory(catalog), [catalog]);

  return (
    <ShellPageScaffold
      eyebrow={t('sources.page.eyebrow')}
      title={t('sources.page.title')}
      description={t('sources.page.description')}
    >
      <div className="flex items-center justify-end">
        <Button onClick={() => setStdioDialogOpen(true)} size="sm" className="gap-1.5">
          <Plus className="size-4" aria-hidden={true} />
          {t('sources.page.addCustom')}
        </Button>
      </div>
      <ShellStatusPanel
        title={t('sources.active.title')}
        description={t('sources.active.description', { count: sources.length })}
        badge={t('sources.page.eyebrow')}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('sources.loading')}</p>
        ) : sources.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-2">
            {sources.map((s) => (
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
      </ShellStatusPanel>

      <ShellStatusPanel
        title={t('sources.catalog.title')}
        description={t('sources.catalog.description')}
      >
        <div className="flex flex-col gap-4">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t(`sources.category.${category}` as TranslationKey)}
              </h3>
              <ul className="flex flex-col gap-2">
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
        </div>
      </ShellStatusPanel>

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
