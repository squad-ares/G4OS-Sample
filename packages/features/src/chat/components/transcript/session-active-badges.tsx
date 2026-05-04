import { Button, cn, useTranslate } from '@g4os/ui';
import { Cpu, FolderOpen, PanelRight, Plug, RotateCcw } from 'lucide-react';

export interface SessionActiveBadgesProps {
  readonly modelLabel?: string | null;
  readonly providerLabel?: string | null;
  readonly workingDirectory?: string | null;
  readonly enabledSourceCount?: number;
  readonly stickySourceCount?: number;
  readonly onOpenModelPicker?: () => void;
  readonly onOpenWorkingDirPicker?: () => void;
  readonly onOpenSourcePicker?: () => void;
  readonly onRetryLast?: () => void;
  readonly onToggleMetadata?: () => void;
  readonly metadataOpen?: boolean;
  readonly className?: string;
}

/**
 * Linha única de chrome para a sessão: chips de modelo / wd / sources
 * (clicáveis pra abrir os pickers correspondentes) + ações leves no fim
 * (retry-last, toggle metadata). Substitui o antigo `SessionHeader` que
 * renderizava bar dedicada com nome editável + 4 botões — paridade V1
 * deixa o canvas máximo, sem chrome competindo com a shell topbar.
 *
 * Nome da sessão fica no sub-sidebar (item ativo) e no `SessionMetadataPanel`
 * (rename via Pencil). Archive vive no metadata panel também.
 */
export function SessionActiveBadges({
  modelLabel,
  providerLabel,
  workingDirectory,
  enabledSourceCount,
  stickySourceCount,
  onOpenModelPicker,
  onOpenWorkingDirPicker,
  onOpenSourcePicker,
  onRetryLast,
  onToggleMetadata,
  metadataOpen,
  className,
}: SessionActiveBadgesProps) {
  const { t } = useTranslate();
  const hasModel = Boolean(modelLabel);
  const hasDir = Boolean(workingDirectory);
  const hasSources = (enabledSourceCount ?? 0) > 0;
  const hasActions = Boolean(onRetryLast || onToggleMetadata);

  if (!hasModel && !hasDir && !hasSources && !hasActions) return null;

  const wd = workingDirectory ? lastSegment(workingDirectory) : null;
  const enabled = enabledSourceCount ?? 0;
  const sticky = stickySourceCount ?? 0;
  const sourceLine =
    sticky > 0 && sticky !== enabled
      ? t('chat.activeBadges.sources.withSticky', { count: enabled, sticky })
      : t(
          enabled === 1 ? 'chat.activeBadges.sources.singular' : 'chat.activeBadges.sources.plural',
          { count: enabled },
        );

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1.5 border-b border-foreground/8 px-4 py-1.5',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {hasModel ? (
          <Chip
            icon={<Cpu className="size-3" aria-hidden={true} />}
            label={providerLabel ? `${providerLabel} · ${modelLabel}` : (modelLabel as string)}
            onClick={onOpenModelPicker}
          />
        ) : null}
        {hasDir && wd ? (
          <Chip
            icon={<FolderOpen className="size-3" aria-hidden={true} />}
            label={wd}
            title={workingDirectory ?? undefined}
            onClick={onOpenWorkingDirPicker}
            mono={true}
          />
        ) : null}
        {hasSources ? (
          <Chip
            icon={<Plug className="size-3" aria-hidden={true} />}
            label={sourceLine}
            onClick={onOpenSourcePicker}
          />
        ) : null}
      </div>

      {hasActions ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {onRetryLast ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRetryLast}
              aria-label={t('chat.header.retryLast')}
              title={t('chat.header.retryLast')}
              className="size-6"
            >
              <RotateCcw className="size-3" aria-hidden={true} />
            </Button>
          ) : null}
          {onToggleMetadata ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleMetadata}
              aria-label={t('chat.header.toggleMetadata')}
              aria-pressed={metadataOpen ? 'true' : 'false'}
              title={t('chat.header.toggleMetadata')}
              className={cn('size-6', metadataOpen && 'bg-foreground/[0.08] text-foreground')}
            >
              <PanelRight className="size-3" aria-hidden={true} />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface ChipProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly title?: string | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly mono?: boolean;
}

function Chip({ icon, label, title, onClick, mono }: ChipProps) {
  const className = cn(
    'flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-2 py-0.5 text-[11px] text-muted-foreground',
    mono && 'font-mono',
    onClick && 'transition-colors hover:bg-accent/12 hover:text-foreground cursor-pointer',
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={className}
        aria-label={label}
      >
        {icon}
        <span className="max-w-[200px] truncate">{label}</span>
      </button>
    );
  }

  return (
    <span className={className} title={title}>
      {icon}
      <span className="max-w-[200px] truncate">{label}</span>
    </span>
  );
}

function lastSegment(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}
