import type { SourceConfigView } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { Button, useTranslate } from '@g4os/ui';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  CircleDashed,
  KeyRound,
  Loader2,
  Power,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';

export interface SourceCardProps {
  readonly source: SourceConfigView;
  readonly onToggle: (enabled: boolean) => void;
  readonly onDelete: () => void;
  readonly disabled?: boolean;
}

export function SourceCard({ source, onToggle, onDelete, disabled }: SourceCardProps): ReactNode {
  const { t } = useTranslate();
  return (
    <li className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
      <StatusIcon status={source.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{source.displayName}</span>
          <KindBadge kind={source.kind} />
          <CategoryBadge category={source.category} />
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {source.slug}
          </span>
          <StatusText status={source.status} />
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle(!source.enabled)}
        disabled={disabled}
        aria-label={source.enabled ? t('sources.disable') : t('sources.enable')}
        className="h-8 px-2"
      >
        <Power
          className={`h-4 w-4 ${source.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}
          aria-hidden={true}
        />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={disabled}
        aria-label={t('sources.delete')}
        className="h-8 px-2"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground transition hover:text-destructive" />
      </Button>
    </li>
  );
}

function StatusIcon({ status }: { readonly status: SourceConfigView['status'] }): ReactNode {
  switch (status) {
    case 'connected':
      return <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-hidden={true} />;
    case 'connecting':
      return <Loader2 className="size-5 shrink-0 animate-spin text-sky-500" aria-hidden={true} />;
    case 'needs_auth':
      return <KeyRound className="size-5 shrink-0 text-amber-500" aria-hidden={true} />;
    case 'error':
      return <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden={true} />;
    default:
      return <CircleDashed className="size-5 shrink-0 text-muted-foreground" aria-hidden={true} />;
  }
}

function StatusText({ status }: { readonly status: SourceConfigView['status'] }): ReactNode {
  const { t } = useTranslate();
  return (
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
    <span className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Circle className="size-2 fill-current" aria-hidden={true} />
      {category}
    </span>
  );
}
