import { cn } from '@g4os/ui';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface CollapsibleResultProps {
  readonly summary: string;
  readonly children: ReactNode;
  readonly isError?: boolean;
  readonly defaultOpen?: boolean;
}

export function CollapsibleResult({
  summary,
  children,
  isError,
  defaultOpen,
}: CollapsibleResultProps) {
  const [open, setOpen] = useState(defaultOpen ?? isError ?? false);

  return (
    <div
      className={cn(
        'my-1 overflow-hidden rounded-lg border text-sm',
        isError
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-foreground/10 bg-foreground/[0.03]',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span
          className={cn('h-1.5 w-1.5 rounded-full', isError ? 'bg-destructive' : 'bg-emerald-400')}
          aria-hidden={true}
        />
        <span className="flex-1 font-mono">{summary}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-foreground/10 px-3 py-2">{children}</div>}
    </div>
  );
}
