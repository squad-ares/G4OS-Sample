import { cn, useTranslate } from '@g4os/ui';
import { GitBranch } from 'lucide-react';

interface BranchButtonProps {
  readonly onBranch: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function BranchButton({ onBranch, disabled, className }: BranchButtonProps) {
  const { t } = useTranslate();
  return (
    <button
      type="button"
      onClick={onBranch}
      disabled={disabled}
      aria-label={t('chat.actions.branch')}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/15 hover:text-foreground disabled:opacity-40',
        className,
      )}
    >
      <GitBranch className="h-3.5 w-3.5" />
    </button>
  );
}
