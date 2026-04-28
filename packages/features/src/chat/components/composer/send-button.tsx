import { Button, cn, Spinner, useTranslate } from '@g4os/ui';
import { ArrowUp, Square } from 'lucide-react';

export interface SendButtonProps {
  readonly onSend: () => void;
  readonly onStop?: () => void;
  readonly disabled?: boolean;
  readonly isProcessing?: boolean;
  readonly className?: string;
}

export function SendButton({ onSend, onStop, disabled, isProcessing, className }: SendButtonProps) {
  const { t } = useTranslate();

  if (isProcessing) {
    const stopLabel = t('chat.composer.stop');
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={stopLabel}
        title={stopLabel}
        onClick={onStop}
        disabled={!onStop}
        className={cn(
          'size-9 shrink-0 rounded-full border-foreground/15 text-foreground/80 hover:bg-accent/12',
          className,
        )}
      >
        {onStop ? (
          <Square className="size-3.5 fill-current" aria-hidden={true} />
        ) : (
          <Spinner size="sm" />
        )}
      </Button>
    );
  }

  const sendLabel = t('chat.composer.send');
  return (
    <Button
      type="button"
      variant="default"
      size="icon"
      aria-label={sendLabel}
      title={sendLabel}
      onClick={onSend}
      disabled={disabled}
      className={cn(
        'size-9 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40',
        className,
      )}
    >
      <ArrowUp className="size-4" aria-hidden={true} />
    </Button>
  );
}
