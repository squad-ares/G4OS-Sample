import { cn, useTranslate } from '@g4os/ui';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

export interface SessionTitleBarProps {
  readonly name: string;
  /** Quando provido, click no nome ativa edição inline (Enter salva, Esc cancela). */
  readonly onRename?: (next: string) => void | Promise<void>;
  readonly className?: string;
}

/**
 * Strip leve com o nome da sessão acima do transcript. Click ativa edição
 * inline (V1 paridade — o título podia ser editado direto da bar do chat).
 *
 * NÃO contém botões de ação — esses ficam em `SessionActiveBadges` (retry,
 * toggle metadata) e no `SessionMetadataPanel` (rename via Pencil, archive).
 * Esse componente existe pra restaurar a affordance "vejo o nome do chat
 * que estou e edito direto se quiser" sem trazer de volta a bar pesada do
 * antigo `SessionHeader` (ADR-0156).
 */
export function SessionTitleBar({ name, onRename, className }: SessionTitleBarProps) {
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

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-foreground/6 px-4 py-2',
        className,
      )}
    >
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
            'min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-sm font-medium text-foreground',
            onRename ? 'hover:bg-accent/12 enabled:cursor-text' : 'cursor-default',
          )}
          title={onRename ? t('chat.header.clickToRename') : undefined}
        >
          {name}
        </button>
      )}
    </div>
  );
}
