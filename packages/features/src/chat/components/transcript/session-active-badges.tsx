import { cn, useTranslate } from '@g4os/ui';
import { Cpu, FolderOpen, Plug } from 'lucide-react';

export interface SessionActiveBadgesProps {
  readonly modelLabel?: string | null;
  readonly providerLabel?: string | null;
  readonly workingDirectory?: string | null;
  readonly enabledSourceCount?: number;
  readonly stickySourceCount?: number;
  readonly onOpenModelPicker?: () => void;
  readonly onOpenWorkingDirPicker?: () => void;
  readonly onOpenSourcePicker?: () => void;
  readonly className?: string;
}

/**
 * Linha de chips ativos abaixo do `SessionHeader` mostrando estado da
 * sessão sem ocupar o transcript: modelo + provider, diretório de
 * trabalho, contagem de sources ativas. Cada chip é clicável e abre o
 * picker correspondente quando a callback é provida.
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
  className,
}: SessionActiveBadgesProps) {
  const { t } = useTranslate();
  const hasModel = Boolean(modelLabel);
  const hasDir = Boolean(workingDirectory);
  const hasSources = (enabledSourceCount ?? 0) > 0;

  if (!hasModel && !hasDir && !hasSources) return null;

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
        'flex shrink-0 flex-wrap items-center gap-1.5 border-b border-foreground/8 px-4 py-1.5',
        className,
      )}
    >
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
