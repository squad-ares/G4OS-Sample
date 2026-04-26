import { Wrench } from 'lucide-react';
import { CollapsibleResult } from '../../../tool-renderers/collapsible-result.tsx';
import type { ToolUseBlock as ToolUseBlockType } from '../../../types.ts';

interface ToolUseBlockProps {
  readonly block: ToolUseBlockType;
}

export function ToolUseBlock({ block }: ToolUseBlockProps) {
  const inputKeys = Object.keys(block.input);
  const summary =
    inputKeys.length === 0
      ? `Called ${block.toolName}`
      : `Called ${block.toolName} (${inputKeys.length} ${inputKeys.length === 1 ? 'arg' : 'args'})`;

  return (
    <div className="my-1 flex items-start gap-2">
      <Wrench className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
      <div className="flex-1">
        <CollapsibleResult summary={summary}>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/80">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </CollapsibleResult>
      </div>
    </div>
  );
}
