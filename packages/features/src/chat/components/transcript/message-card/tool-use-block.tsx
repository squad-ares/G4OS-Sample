import { cn } from '@g4os/ui';
import { ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { ToolUseBlock as ToolUseBlockType } from '../../../types.ts';

interface ToolUseBlockProps {
  readonly block: ToolUseBlockType;
}

/**
 * Card compacto pra `tool_use` blocks. Paridade visual com V1
 * `InlineExecution`: ícone + tool name (mono) + arg preview inline em
 * uma linha; click expande pra mostrar input completo (JSON).
 *
 * Tool name fica em `text-foreground/85` com leve background — destaca
 * sem competir com o texto principal da assistant message.
 */
export function ToolUseBlock({ block }: ToolUseBlockProps) {
  const [open, setOpen] = useState(false);
  const argSummary = formatArgs(block.input);

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-foreground/10 bg-foreground/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/12"
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
          aria-hidden={true}
        />
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
        <span className="font-mono text-[11px] font-semibold text-foreground/85">
          {block.toolName}
        </span>
        {argSummary ? (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">{argSummary}</span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-foreground/10 px-3 py-2">
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/80">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sumariza args em uma linha — extrai o valor escalar mais relevante
 * pelas heurísticas comuns (command, path, query, etc.).
 */
function formatArgs(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return '';

  const priority = ['command', 'path', 'file_path', 'query', 'name', 'pattern'];
  for (const key of priority) {
    const v = input[key];
    if (typeof v === 'string' && v.length > 0) {
      const truncated = v.length > 80 ? `${v.slice(0, 80)}…` : v;
      return `${key}="${truncated}"`;
    }
  }

  const firstScalar = entries.find(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
  if (firstScalar) {
    const [k, v] = firstScalar;
    const display = typeof v === 'string' && v.length > 60 ? `${v.slice(0, 60)}…` : String(v);
    return `${k}="${display}"`;
  }

  return `${entries.length} ${entries.length === 1 ? 'arg' : 'args'}`;
}
