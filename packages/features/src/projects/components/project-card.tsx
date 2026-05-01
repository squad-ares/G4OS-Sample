import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useTranslate,
} from '@g4os/ui';
import { FolderKanban, MoreHorizontal } from 'lucide-react';
import { HighlightedTitle } from '../../shell/index.ts';
import type { ProjectListItem } from '../types.ts';

export interface ProjectCardProps {
  readonly project: ProjectListItem;
  readonly onOpen?: (id: string) => void;
  readonly onArchive?: (id: string) => void;
  readonly onDelete?: (id: string) => void;
  /** CR-18 F-F5: query opcional para search-inline highlight no nome. */
  readonly searchQuery?: string;
}

const COLOR_FALLBACK = '#6366f1';

export function ProjectCard({
  project,
  onOpen,
  onArchive,
  onDelete,
  searchQuery,
}: ProjectCardProps) {
  const { t } = useTranslate();
  const accent = project.color ?? COLOR_FALLBACK;
  const isArchived = project.status === 'archived';
  const updatedRelative = formatRelativeTime(project.updatedAt);

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md',
        isArchived && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onOpen?.(project.id)}
        >
          <span
            aria-hidden={true}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: accent }}
          >
            <FolderKanban className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {searchQuery ? (
                <HighlightedTitle text={project.name} query={searchQuery} />
              ) : (
                project.name
              )}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">{project.slug}</span>
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild={true}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
            >
              <span className="sr-only">{t('project.card.options')}</span>
              <MoreHorizontal className="h-4 w-4" aria-hidden={true} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpen?.(project.id)}>
              {t('project.card.action.open')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive?.(project.id)}>
              {t('project.card.action.archive')}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete?.(project.id)}>
              {t('project.card.action.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {project.description ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
      ) : null}

      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            isArchived
              ? 'bg-muted text-muted-foreground'
              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          )}
        >
          {isArchived ? t('project.card.status.archived') : t('project.card.status.active')}
        </span>
        {updatedRelative ? (
          <span className="text-[11px] text-muted-foreground">
            {t('project.card.updatedRelative', { when: updatedRelative })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatRelativeTime(ms: number): string | null {
  try {
    const delta = Date.now() - ms;
    if (delta < 0) return null;
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  } catch {
    return null;
  }
}
