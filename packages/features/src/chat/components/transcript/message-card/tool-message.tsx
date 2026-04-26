import { ToolResultDispatcher } from '../../../tool-renderers/tool-result-dispatcher.tsx';
import type { Message } from '../../../types.ts';

interface ToolMessageProps {
  readonly message: Message;
}

/**
 * Render para mensagens com role='tool': cada bloco `tool_result` no
 * conteúdo é despachado via `ToolResultDispatcher`, que escolhe um
 * renderer específico (bash/read-file/search-results) ou cai no fallback
 * (CollapsibleResult com JSON).
 *
 * O `toolName` original vive na mensagem assistant que originou o
 * `tool_use` — não no `tool_result`. Para preservar o registry baseado
 * em nome, lookups específicos de tool dependem do dispatcher casar
 * pelo conteúdo. Quando o renderer precisa do nome, usa o fallback.
 */
export function ToolMessage({ message }: ToolMessageProps) {
  const results = message.content.filter((b) => b.type === 'tool_result');
  if (results.length === 0) return null;

  return (
    <div className="px-4 py-1">
      <div className="max-w-[85%] text-sm text-foreground">
        {results.map((block, i) => {
          if (block.type !== 'tool_result') return null;
          const text =
            typeof block.content === 'string'
              ? block.content
              : block.content.map((c) => c.text).join('\n');
          const k = `${message.id}-toolresult-${i}`;
          return (
            <ToolResultDispatcher
              key={k}
              toolName="unknown"
              result={block.isError ? { error: text } : text}
              toolUseId={block.toolUseId}
            />
          );
        })}
      </div>
    </div>
  );
}
