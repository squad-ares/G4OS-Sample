import { cn, useTranslate } from '@g4os/ui';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';

export interface SessionTitleBarProps {
  readonly name: string;
  /** Quando provido, click no nome ativa edição inline (Enter salva, Esc cancela). */
  readonly onRename?: (next: string) => void | Promise<void>;
  /**
   * CR-28 F-CR28-3 — Slot opcional (entre nome e actions) para chip de
   * projeto linkado, indicadores de pin/star/unread, etc. Paridade V1
   * `PanelHeader.badge` que renderizava `ProjectBadge` inline.
   */
  readonly projectBadge?: ReactNode;
  /**
   * CR-28 F-CR28-1 — Slot opcional (direita) para botão de menu / ações
   * (pin, star, archive, delete, open in new window). V1 PanelHeader tinha
   * um chevron+dropdown com 10 ações via `SessionMenu`; V2 expõe via slot
   * pra que a route monte o menu próprio sem inflar este componente com
   * lógica IPC. Paridade V1 mantendo chrome leve do ADR-0156.
   */
  readonly actions?: ReactNode;
  /**
   * CR-28 F-CR28-2 — Quando true, aplica shimmer/pulse no nome — feedback
   * visual pra usuário durante geração de título (paridade V1
   * `animate-shimmer-text` em PanelHeader). Set durante o 2º turn quando
   * AI title refinement está em andamento (~3-8s).
   */
  readonly isRegenerating?: boolean;
  /**
   * Quando true, remove o `border-b` — útil quando este componente é
   * seguido de outra strip que já tem border-top (ex.: `SessionActiveBadges`
   * com `border-b`), evitando 2 borders empilhadas.
   */
  readonly noBorderBottom?: boolean;
  readonly className?: string;
}

/**
 * Strip leve com o nome da sessão acima do transcript. Click ativa edição
 * inline (V1 paridade — o título podia ser editado direto da bar do chat).
 *
 * Slots `projectBadge`/`actions` permitem à route injetar chips/menus
 * sem voltar à bar pesada do antigo `SessionHeader` (ADR-0156). O componente
 * permanece sem lógica IPC própria.
 */
export function SessionTitleBar({
  name,
  onRename,
  projectBadge,
  actions,
  isRegenerating,
  noBorderBottom,
  className,
}: SessionTitleBarProps) {
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
        'flex shrink-0 items-center gap-2 px-4 py-2',
        !noBorderBottom && 'border-b border-foreground/6',
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
            // CR-28 F-CR28-2: shimmer durante regeneração — paridade V1
            // `animate-shimmer-text`. Usa `animate-pulse` builtin do Tailwind
            // sem precisar de keyframe custom.
            isRegenerating && 'animate-pulse opacity-70',
          )}
          title={onRename ? t('chat.header.clickToRename') : undefined}
          aria-busy={isRegenerating ? 'true' : 'false'}
        >
          {name}
        </button>
      )}
      {projectBadge ? (
        <div className="shrink-0" aria-hidden={false}>
          {projectBadge}
        </div>
      ) : null}
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
