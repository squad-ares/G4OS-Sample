import { cn, useTranslate } from '@g4os/ui';
import { RotateCcw } from 'lucide-react';

interface RetryButtonProps {
  readonly onRetry: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function RetryButton({ onRetry, disabled, className }: RetryButtonProps) {
  const { t } = useTranslate();
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={disabled}
      aria-label={t('chat.actions.retry')}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40',
        className,
      )}
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </button>
  );
}
