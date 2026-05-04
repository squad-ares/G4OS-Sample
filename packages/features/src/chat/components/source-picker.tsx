import type { SourceConfigView, SourceKind } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { Button, Popover, PopoverContent, PopoverTrigger, useTranslate } from '@g4os/ui';
import { Check, ChevronDown, LayoutGrid, Plug2 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

/** CR-37 F-CR37-17: mapas tipados eliminam `as TranslationKey` em site-call. */
const PICKER_KIND_KEYS: Record<SourceKind, TranslationKey> = {
  managed: 'chat.sourcePicker.kind.managed',
  'mcp-http': 'chat.sourcePicker.kind.mcp-http',
  'mcp-stdio': 'chat.sourcePicker.kind.mcp-stdio',
  api: 'chat.sourcePicker.kind.api',
  filesystem: 'chat.sourcePicker.kind.filesystem',
};

const PICKER_STATUS_KEYS: Record<SourceConfigView['status'], TranslationKey> = {
  connected: 'sources.status.connected',
  disconnected: 'sources.status.disconnected',
  connecting: 'sources.status.connecting',
  needs_auth: 'sources.status.needs_auth',
  error: 'sources.status.error',
};

export interface SourcePickerProps {
  readonly sources: readonly SourceConfigView[];
  readonly enabledSlugs: readonly string[];
  readonly rejectedSlugs?: readonly string[];
  readonly onChange: (slugs: readonly string[]) => void;
  readonly onOpenManage?: () => void;
  readonly disabled?: boolean;
}

const KIND_ORDER: readonly SourceKind[] = ['managed', 'mcp-http', 'mcp-stdio', 'api', 'filesystem'];

export function SourcePicker({
  sources,
  enabledSlugs,
  rejectedSlugs,
  onChange,
  onOpenManage,
  disabled,
}: SourcePickerProps): ReactNode {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);

  const enabledSet = useMemo(() => new Set(enabledSlugs), [enabledSlugs]);
  const rejectedSet = useMemo(() => new Set(rejectedSlugs ?? []), [rejectedSlugs]);
  const grouped = useMemo(() => groupByKind(sources), [sources]);

  const count = enabledSet.size;

  const handleToggle = (slug: string, nextEnabled: boolean): void => {
    if (rejectedSet.has(slug)) return;
    const next = nextEnabled
      ? Array.from(new Set([...enabledSlugs, slug]))
      : enabledSlugs.filter((s) => s !== slug);
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild={true}>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1 text-xs"
          aria-label={t('chat.sourcePicker.ariaLabel')}
        >
          <LayoutGrid className="size-3.5 opacity-70" aria-hidden={true} />
          {count > 0
            ? t('chat.sourcePicker.chipWithCount', { count })
            : t('chat.composer.chip.source')}
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden={true} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 overflow-hidden p-0 shadow-lg ring-1 ring-foreground/10"
        align="start"
        sideOffset={6}
      >
        {sources.length === 0 ? (
          <EmptyState {...(onOpenManage ? { onOpenManage } : {})} />
        ) : (
          <div className="flex max-h-[360px] flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 border-b border-foreground/10">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('chat.sourcePicker.title')}
              </span>
              {onOpenManage && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenManage();
                  }}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  {t('chat.sourcePicker.manage')}
                </button>
              )}
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {grouped.map(({ kind, items }) => (
                <li key={kind} className="flex flex-col">
                  <span className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(PICKER_KIND_KEYS[kind])}
                  </span>
                  <ul>
                    {items.map((source) => (
                      <SourceRow
                        key={source.id}
                        source={source}
                        enabled={enabledSet.has(source.slug)}
                        rejected={rejectedSet.has(source.slug)}
                        onToggle={(next) => handleToggle(source.slug, next)}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface SourceRowProps {
  readonly source: SourceConfigView;
  readonly enabled: boolean;
  readonly rejected: boolean;
  readonly onToggle: (next: boolean) => void;
}

function SourceRow({ source, enabled, rejected, onToggle }: SourceRowProps): ReactNode {
  const { t } = useTranslate();
  const unselectable = rejected || source.status === 'error';

  return (
    <li>
      <button
        type="button"
        disabled={unselectable}
        onClick={() => onToggle(!enabled)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
          unselectable
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-accent/12 aria-[pressed=true]:bg-accent/60'
        }`}
        aria-pressed={enabled}
      >
        <span
          className={`flex size-4 shrink-0 items-center justify-center rounded border ${
            enabled ? 'border-accent bg-accent text-accent-foreground' : 'border-foreground/20'
          }`}
          aria-hidden={true}
        >
          {enabled && <Check className="size-3" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{source.displayName}</span>
        <StatusBadge status={source.status} />
        {rejected && (
          <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px] italic text-muted-foreground">
            {t('chat.sourcePicker.rejected')}
          </span>
        )}
      </button>
    </li>
  );
}

function StatusBadge({ status }: { readonly status: SourceConfigView['status'] }): ReactNode {
  const { t } = useTranslate();
  const cls =
    status === 'connected'
      ? 'text-emerald-600'
      : status === 'error'
        ? 'text-destructive'
        : status === 'needs_auth'
          ? 'text-amber-600'
          : 'text-muted-foreground';
  return (
    <span className={`text-[9px] uppercase tracking-wider ${cls}`}>
      {t(PICKER_STATUS_KEYS[status])}
    </span>
  );
}

function EmptyState({ onOpenManage }: { readonly onOpenManage?: () => void }): ReactNode {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <Plug2 className="size-7 text-muted-foreground/50" aria-hidden={true} />
      <p className="text-xs font-medium">{t('chat.sourcePicker.empty.title')}</p>
      <p className="text-[11px] text-muted-foreground">
        {t('chat.sourcePicker.empty.description')}
      </p>
      {onOpenManage && (
        <Button size="sm" variant="outline" onClick={onOpenManage} className="mt-2">
          {t('chat.sourcePicker.manage')}
        </Button>
      )}
    </div>
  );
}

function groupByKind(
  sources: readonly SourceConfigView[],
): readonly { kind: SourceKind; items: SourceConfigView[] }[] {
  const map = new Map<SourceKind, SourceConfigView[]>();
  for (const s of sources) {
    const existing = map.get(s.kind);
    if (existing) existing.push(s);
    else map.set(s.kind, [s]);
  }
  return KIND_ORDER.filter((k) => map.has(k)).map((kind) => ({
    kind,
    items: map.get(kind) ?? [],
  }));
}
