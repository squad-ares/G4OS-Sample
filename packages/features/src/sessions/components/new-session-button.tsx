/**
 * Botão compacto para criar sessão rápida (Cmd/Ctrl+N). Sem dialog —
 * a mutation usa os defaults do workspace. Para detalhes customizados,
 * o consumidor navega para um detail screen; aqui apenas atende a UX
 * de "quick create" descrita na TASK-11-01-02.
 */

import { Button, useTranslate } from '@g4os/ui';
import { Plus } from 'lucide-react';

export interface NewSessionButtonProps {
  readonly onClick: () => void;
  readonly isPending?: boolean;
  readonly showShortcut?: boolean;
}

export function NewSessionButton({
  onClick,
  isPending,
  showShortcut = true,
}: NewSessionButtonProps) {
  const { t } = useTranslate();
  return (
    <Button size="sm" onClick={onClick} disabled={isPending} className="gap-2">
      <Plus className="size-4" aria-hidden={true} />
      {t('session.list.new')}
      {showShortcut ? (
        <span className="hidden rounded-sm bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70 md:inline">
          {t('session.list.newShortcut')}
        </span>
      ) : null}
    </Button>
  );
}
