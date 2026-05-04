/**
 * CR-37 F-CR37-21: useRef para o timeout evita `setCopied(false)` após
 * desmonte (memory leak + warning). Erros de clipboard são silenciados —
 * o estado de `copied` simplesmente não muda, sem crash ou console.error.
 */
import { cn, useTranslate } from '@g4os/ui';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CopyButtonProps {
  readonly text: string;
  readonly className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const { t } = useTranslate();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setCopied(false);
          timeoutRef.current = null;
        }, 1500);
      },
      () => undefined,
    );
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
