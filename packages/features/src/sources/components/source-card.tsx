import type { SourceConfigView } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { Button, ConfirmDestructiveDialog, useTranslate } from '@g4os/ui';
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  KeyRound,
  Loader2,
  Plug,
  Power,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { HighlightedTitle } from '../../shell/index.ts';
import { SourceGlyph } from './source-glyph.tsx';

export interface SourceCardProps {
  readonly source: SourceConfigView;
  readonly onToggle: (enabled: boolean) => void;
  readonly onDelete: () => void;
  readonly onTest?: () => void;
  readonly testing?: boolean;
  readonly disabled?: boolean;
  /** CR-18 F-F5: query opcional para search-inline highlight no displayName. */
  readonly searchQuery?: string;
}

export function SourceCard({
  source,
  onToggle,
  onDelete,
  onTest,
  testing,
  disabled,
  searchQuery,
}: SourceCardProps): ReactNode {
  const { t } = useTranslate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const testable =
    source.kind === 'mcp-stdio' ||
    source.kind === 'mcp-http' ||
    source.kind === 'api' ||
    source.kind === 'filesystem';

  return (
    <li className="flex min-h-[124px] flex-col gap-3 rounded-lg border border-foreground/10 bg-background px-4 py-3 transition-colors hover:border-foreground/20">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <SourceGlyph source={source} />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-background shadow-sm">
              <StatusIcon status={source.status} />
            </span>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">
                {searchQuery ? (
                  <HighlightedTitle text={source.displayName} query={searchQuery} />
                ) : (
                  source.displayName
                )}
              </span>
              <StatusBadge status={source.status} enabled={source.enabled} t={t} />
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {source.slug}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <KindBadge kind={source.kind} />
          <CategoryBadge category={source.category} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-foreground/5 pt-2">
        {testable && onTest ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onTest}
            disabled={disabled || testing === true}
            aria-label={t('sources.test')}
            className="h-7 px-2 text-muted-foreground hover:bg-accent/15 hover:text-foreground"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" aria-hidden={true} />
            ) : (
              <Plug className="h-3.5 w-3.5" aria-hidden={true} />
            )}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggle(!source.enabled)}
          disabled={disabled}
          aria-label={source.enabled ? t('sources.disable') : t('sources.enable')}
          className="h-7 px-2 text-muted-foreground hover:bg-accent/15 hover:text-foreground"
        >
          <Power
            className={`h-3.5 w-3.5 ${source.enabled ? 'text-emerald-500' : ''}`}
            aria-hidden={true}
          />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={disabled}
          aria-label={t('sources.delete')}
          className="h-7 px-2 text-muted-foreground hover:bg-accent/15 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden={true} />
        </Button>
      </div>
      <ConfirmDestructiveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('sources.delete.title')}
        description={t('sources.delete.confirm')}
        confirmLabel={t('sources.delete.confirmLabel')}
        cancelLabel={t('sources.delete.cancelLabel')}
        onConfirm={onDelete}
      />
    </li>
  );
}

function StatusIcon({ status }: { readonly status: SourceConfigView['status'] }): ReactNode {
  switch (status) {
    case 'connected':
      return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" aria-hidden={true} />;
    case 'connecting':
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-sky-500" aria-hidden={true} />;
    case 'needs_auth':
      return <KeyRound className="size-3.5 shrink-0 text-amber-500" aria-hidden={true} />;
    case 'error':
      return <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-hidden={true} />;
    default:
      return (
        <CircleDashed className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
      );
  }
}

function StatusBadge({
  status,
  enabled,
  t,
}: {
  readonly status: SourceConfigView['status'];
  readonly enabled: boolean;
  readonly t: (key: TranslationKey) => string;
}): ReactNode {
  if (!enabled) {
    return (
      <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        {t('sources.status.disconnected')}
      </span>
    );
  }
  const colorMap: Record<SourceConfigView['status'], string> = {
    connected: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    connecting: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
    needs_auth: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    error: 'bg-destructive/10 text-destructive',
    disconnected: 'bg-foreground/5 text-muted-foreground',
  };
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colorMap[status] ?? colorMap.disconnected}`}
    >
      {t(`sources.status.${status}` as TranslationKey)}
    </span>
  );
}

function KindBadge({ kind }: { readonly kind: SourceConfigView['kind'] }): ReactNode {
  return (
    <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {kind}
    </span>
  );
}

function CategoryBadge({
  category,
}: {
  readonly category: SourceConfigView['category'];
}): ReactNode {
  return (
    <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {category}
    </span>
  );
}
