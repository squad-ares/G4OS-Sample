import { Button, useTranslate } from '@g4os/ui';
import { Package, Search, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { SubSidebarShell } from './sub-sidebar-shell.tsx';

export interface MarketplacePanelItem {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly description?: string;
  readonly creatorDisplayName?: string;
  readonly installed?: boolean;
}

export interface MarketplacePanelProps {
  readonly items: readonly MarketplacePanelItem[];
  readonly activeItemId?: string | undefined;
  readonly loading?: boolean;
  readonly onOpenItem: (id: string) => void;
  readonly onBrowse: () => void;
  readonly footer?: ReactNode;
}

export function MarketplacePanel({
  items,
  activeItemId,
  loading = false,
  onOpenItem,
  onBrowse,
  footer,
}: MarketplacePanelProps) {
  const { t } = useTranslate();

  const installed = items.filter((i) => i.installed);
  const featured = items.filter((i) => !i.installed);

  const header = (
    <>
      <Button
        variant="outline"
        className="mb-3 h-10 w-full justify-start gap-2 rounded-[12px] px-3 text-sm font-semibold"
        onClick={onBrowse}
      >
        <Search className="h-4 w-4" aria-hidden={true} />
        {t('shell.subsidebar.marketplace.browse')}
      </Button>

      <div className="px-1 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('shell.subsidebar.marketplace.section')}
        </span>
      </div>
    </>
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <div className="mask-fade-bottom min-h-0 flex-1 overflow-y-auto pb-3">
        {loading ? (
          <div className="flex flex-col gap-1 px-2">
            {['sk-a', 'sk-b', 'sk-c'].map((k) => (
              <div key={k} className="h-12 animate-pulse rounded-[10px] bg-foreground/5" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState onBrowse={onBrowse} />
        ) : (
          <>
            {installed.length > 0 ? (
              <>
                <SubsectionHeader label={t('shell.subsidebar.marketplace.installed')} />
                <ul className="flex flex-col gap-0.5 px-2">
                  {installed.map((item) => (
                    <li key={item.id}>
                      <MarketplaceRow
                        item={item}
                        active={activeItemId === item.id}
                        onOpen={onOpenItem}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {featured.length > 0 ? (
              <>
                <SubsectionHeader label={t('shell.subsidebar.marketplace.featured')} />
                <ul className="flex flex-col gap-0.5 px-2">
                  {featured.map((item) => (
                    <li key={item.id}>
                      <MarketplaceRow
                        item={item}
                        active={activeItemId === item.id}
                        onOpen={onOpenItem}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
    </SubSidebarShell>
  );
}

interface SubsectionHeaderProps {
  readonly label: string;
}
function SubsectionHeader({ label }: SubsectionHeaderProps) {
  return (
    <div className="px-4 pb-1 pt-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

interface MarketplaceRowProps {
  readonly item: MarketplacePanelItem;
  readonly active: boolean;
  readonly onOpen: (id: string) => void;
}

function MarketplaceRow({ item, active, onOpen }: MarketplaceRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-start gap-2 rounded-[10px] px-3 py-2 text-left transition-colors ${
        active ? 'bg-foreground/8 text-foreground' : 'text-foreground/85 hover:bg-foreground/5'
      }`}
    >
      <span
        aria-hidden={true}
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-foreground/80"
      >
        <Package className="h-3.5 w-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-1 text-[13px] font-medium">{item.name}</span>
        <span className="line-clamp-1 text-[11px] text-muted-foreground">
          {item.creatorDisplayName ?? item.category ?? item.description ?? ''}
        </span>
      </div>
    </button>
  );
}

interface EmptyStateProps {
  readonly onBrowse: () => void;
}
function EmptyState({ onBrowse }: EmptyStateProps) {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.05] text-foreground/80">
        <Package className="h-6 w-6" aria-hidden={true} />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          {t('shell.subsidebar.marketplace.emptyTitle')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('shell.subsidebar.marketplace.emptyDescription')}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onBrowse} className="rounded-full">
        <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden={true} />
        {t('shell.subsidebar.marketplace.browse')}
      </Button>
    </div>
  );
}
