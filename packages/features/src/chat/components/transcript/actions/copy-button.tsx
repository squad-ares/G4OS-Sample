import { cn, useTranslate } from '@g4os/ui';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface CopyButtonProps {
  readonly text: string;
  readonly className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const { t } = useTranslate();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? t('chat.actions.copied') : t('chat.actions.copy')}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/15 hover:text-foreground',
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
