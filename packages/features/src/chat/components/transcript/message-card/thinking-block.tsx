import { cn } from '@g4os/ui';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ThinkingBlock as ThinkingBlockType } from '../../../types.ts';

interface ThinkingBlockProps {
  readonly block: ThinkingBlockType;
  readonly isStreaming?: boolean;
}

export function ThinkingBlock({ block, isStreaming }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-foreground/10 bg-foreground/3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" aria-hidden={true} />
        <span className="flex-1 font-medium italic">
          {isStreaming ? 'Thinking…' : 'Thought process'}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-foreground/10 px-3 py-2">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
            {block.thinking}
          </pre>
        </div>
      )}
    </div>
  );
}
