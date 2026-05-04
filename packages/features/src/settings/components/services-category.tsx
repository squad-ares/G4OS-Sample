import { Button, useTranslate } from '@g4os/ui';
import { Activity, AlertCircle, AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

export interface ServiceStatusItem {
  readonly id: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly configured: boolean;
  readonly reachable: boolean | null;
  readonly latencyMs: number | null;
  readonly error: string | null;
  readonly endpoint: string | null;
}

export interface ServicesCategoryProps {
  readonly items: readonly ServiceStatusItem[];
  readonly isLoading?: boolean;
  readonly isFetching?: boolean;
  readonly isError?: boolean;
  readonly lastCheckedAt?: number | null;
  readonly onRefresh?: () => void;
}

function StatusBadge({ item }: { item: ServiceStatusItem }) {
  const { t } = useTranslate();

  if (!item.configured) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <WifiOff className="size-3" aria-hidden={true} />
        {t('settings.services.status.notConfigured')}
      </span>
    );
  }
  if (item.reachable === true) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Activity className="size-3" aria-hidden={true} />
        {item.latencyMs == null
          ? t('settings.services.status.active')
          : t('settings.services.status.activeWithLatency', { ms: String(item.latencyMs) })}
      </span>
    );
  }
  if (item.reachable === false) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <AlertTriangle className="size-3" aria-hidden={true} />
        {t('settings.services.status.unreachable')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <RefreshCw className="size-3 animate-spin" aria-hidden={true} />
      {t('settings.services.status.checking')}
    </span>
  );
}

export function ServicesCategory({
  items,
  isLoading,
  isFetching,
  isError,
  lastCheckedAt,
  onRefresh,
}: ServicesCategoryProps) {
  const { t, formatDate } = useTranslate();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{t('settings.services.title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('settings.services.description')}
          </p>
          {lastCheckedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('settings.services.lastChecked', {
                time: formatDate(lastCheckedAt, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              })}
            </p>
          ) : null}
        </div>
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="shrink-0"
          >
            <RefreshCw
              className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden={true}
            />
            {t('settings.services.refresh')}
          </Button>
        ) : null}
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden={true} />
          {t('settings.services.loadError')}
        </div>
      )}

      <div className="divide-y divide-foreground/[0.06] rounded-xl border border-foreground/[0.08] bg-background">
        {items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none">{t(item.labelKey as never)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(item.descriptionKey as never)}
              </p>
              {item.endpoint ? (
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">
                  {item.endpoint}
                </p>
              ) : null}
              {item.configured && item.reachable === false && item.error ? (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  {t('settings.services.errorPrefix')} {item.error}
                </p>
              ) : null}
            </div>
            <div className="ml-4 shrink-0 pt-0.5">
              {isLoading ? (
                <span className="block h-4 w-14 animate-pulse rounded bg-muted" />
              ) : (
                <StatusBadge item={item} />
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{t('settings.services.note')}</p>
    </div>
  );
}
