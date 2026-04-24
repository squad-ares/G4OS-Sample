import type { NewsItem } from '@g4os/kernel/types';
import { useTranslate } from '@g4os/ui';
import { Newspaper } from 'lucide-react';
import type { ReactNode } from 'react';
import { SubSidebarShell } from '../../shell/index.ts';

export interface NewsPanelProps {
  readonly items: readonly NewsItem[];
  readonly selectedId?: string | undefined;
  readonly seenIds: ReadonlySet<string>;
  readonly onSelect: (id: string) => void;
  readonly onRefresh?: () => void;
  readonly isRefreshing?: boolean;
  readonly footer?: ReactNode;
}

export function NewsPanel({
  items,
  selectedId,
  seenIds,
  onSelect,
  onRefresh,
  isRefreshing,
  footer,
}: NewsPanelProps) {
  const { t } = useTranslate();

  const header = (
    <>
      <div className="flex items-center gap-2 px-1 pb-2">
        <span
          aria-hidden={true}
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/10"
        >
          <Newspaper className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('news.list.title')}
        </span>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
          >
            {isRefreshing ? t('news.list.refreshing') : t('news.list.refresh')}
          </button>
        )}
      </div>
      <p className="px-1 pb-2 text-[11px] text-muted-foreground">
        {t('news.list.count', { count: items.length })}
      </p>
    </>
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <nav
        aria-label={t('news.list.title')}
        className="mask-fade-bottom min-h-0 flex-1 overflow-y-auto pb-3"
      >
        {items.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">{t('news.list.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2">
            {items.map((item) => {
              const isActive = item.id === selectedId;
              const unread = !seenIds.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`block w-full rounded-[10px] px-3 py-2 text-left transition-colors ${
                      isActive
                        ? 'bg-foreground/8 text-foreground'
                        : 'text-foreground/85 hover:bg-foreground/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[13px] font-medium">{item.title}</span>
                      {unread && (
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
                          role="status"
                          aria-label={t('news.list.unread')}
                        />
                      )}
                    </div>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatDate(item.publishDate)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </SubSidebarShell>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
