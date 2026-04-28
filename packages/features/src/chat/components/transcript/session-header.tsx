import { Button, cn, useTranslate } from '@g4os/ui';
import { Archive, MoreHorizontal, PanelRight, RotateCcw } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

export interface SessionHeaderProps {
  readonly name: string;
  readonly modelLabel?: string;
  readonly providerLabel?: string;
  readonly workingDirectory?: string | null;
  readonly onRename?: (next: string) => void | Promise<void>;
  readonly onArchive?: () => void;
  readonly onRetryLast?: () => void;
  readonly onOpenMenu?: () => void;
  readonly onToggleMetadata?: () => void;
  readonly metadataOpen?: boolean;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: (reason: header coeso com inline-edit + 5 ações condicionais. Quebrá-lo em sub-componentes adicionaria boilerplate sem clareza — cada conditional é uma feature visível distinta)
export function SessionHeader({
  name,
  modelLabel,
  providerLabel,
  workingDirectory,
  onRename,
  onArchive,
  onRetryLast,
  onOpenMenu,
  onToggleMetadata,
  metadataOpen,
}: SessionHeaderProps) {
  const { t } = useTranslate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== name && onRename) {
      void onRename(trimmed);
    } else {
      setDraft(name);
    }
  };

  const cancel = () => {
    setEditing(false);
    setDraft(name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const wd = workingDirectory ? lastSegment(workingDirectory) : null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-foreground/8 px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            className="min-w-0 flex-1 rounded-md border border-foreground/15 bg-transparent px-2 py-1 text-sm font-medium text-foreground outline-none focus:border-foreground/40"
            aria-label={t('chat.header.sessionNameLabel')}
          />
        ) : (
          <button
            type="button"
            onClick={() => onRename && setEditing(true)}
            disabled={!onRename}
            className={cn(
              'min-w-0 truncate rounded-md px-2 py-1 text-left text-sm font-medium text-foreground',
              onRename ? 'hover:bg-accent/12 enabled:cursor-text' : 'cursor-default',
            )}
            title={onRename ? t('chat.header.clickToRename') : undefined}
          >
            {name}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        {providerLabel ? (
          <span className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-1.5 py-0.5">
            {providerLabel}
          </span>
        ) : null}
        {modelLabel ? (
          <span
            className="max-w-[200px] truncate rounded-md border border-foreground/10 bg-foreground/[0.03] px-1.5 py-0.5"
            title={modelLabel}
          >
            {modelLabel}
          </span>
        ) : null}
        {wd ? (
          <span
            className="max-w-[140px] truncate rounded-md border border-foreground/10 bg-foreground/[0.03] px-1.5 py-0.5 font-mono"
            title={workingDirectory ?? undefined}
          >
            {wd}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {onRetryLast ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRetryLast}
            aria-label={t('chat.header.retryLast')}
            title={t('chat.header.retryLast')}
            className="size-7"
          >
            <RotateCcw className="size-3.5" aria-hidden={true} />
          </Button>
        ) : null}
        {onArchive ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onArchive}
            aria-label={t('chat.header.archive')}
            title={t('chat.header.archive')}
            className="size-7"
          >
            <Archive className="size-3.5" aria-hidden={true} />
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
            className={cn('size-7', metadataOpen && 'bg-foreground/[0.08] text-foreground')}
          >
            <PanelRight className="size-3.5" aria-hidden={true} />
          </Button>
        ) : null}
        {onOpenMenu ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenMenu}
            aria-label={t('chat.header.moreActions')}
            title={t('chat.header.moreActions')}
            className="size-7"
          >
            <MoreHorizontal className="size-3.5" aria-hidden={true} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function lastSegment(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}
