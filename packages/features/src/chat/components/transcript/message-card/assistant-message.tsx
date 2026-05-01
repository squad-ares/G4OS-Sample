import { useTranslate } from '@g4os/ui';
import type { Message } from '../../../types.ts';
import { MarkdownRenderer } from '../markdown/markdown-renderer.tsx';
import { ThinkingBlock } from './thinking-block.tsx';
import { ToolUseBlock } from './tool-use-block.tsx';

interface AssistantMessageProps {
  readonly message: Message;
  readonly isStreaming?: boolean;
}

/**
 * Status line mostrada quando turn está streaming mas ainda não emitiu
 * texto. Comunica fase em vez de só mostrar cursor pulsing — paridade
 * V1 que mostra "Pensando…", "Executando shell…", etc.
 *
 * Heurística: olha o último bloco. Sem blocos = thinking. Último é
 * `thinking` = continua thinking. Último é `tool_use` = tool. Se já
 * é text, cursor cobre — sem status duplicado.
 */
function inferStreamingStatusKey(message: Message): 'thinking' | 'tool' | null {
  if (message.content.length === 0) return 'thinking';
  const last = message.content[message.content.length - 1];
  if (!last) return 'thinking';
  if (last.type === 'thinking') return 'thinking';
  if (last.type === 'tool_use') return 'tool';
  return null;
}

export function AssistantMessage({ message, isStreaming }: AssistantMessageProps) {
  const { t } = useTranslate();
  const lastIdx = message.content.length - 1;
  const statusKey = isStreaming ? inferStreamingStatusKey(message) : null;

  return (
    <div className="px-4 py-1">
      <div className="max-w-[85%] text-sm text-foreground">
        {message.content.map((block, i) => {
          const isLast = i === lastIdx;
          if (block.type === 'thinking') {
            const k = `${message.id}-thinking-${i}`;
            return (
              <ThinkingBlock
                key={k}
                block={block}
                {...(isStreaming && isLast ? { isStreaming: true } : {})}
              />
            );
          }
          if (block.type === 'text') {
            const k = `${message.id}-text-${i}`;
            return (
              <MarkdownRenderer
                key={k}
                content={block.text}
                {...(isStreaming && isLast ? { isStreaming: true } : {})}
              />
            );
          }
          if (block.type === 'tool_use') {
            const k = `${message.id}-tooluse-${i}`;
            return <ToolUseBlock key={k} block={block} />;
          }
          // tool_result não aparece em assistant turns no V2; vem em mensagem
          // separada role='tool' (renderizada por ToolMessage).
          return null;
        })}
        {statusKey ? (
          <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="flex gap-0.5" aria-hidden={true}>
              <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
            </span>
            <span>
              {statusKey === 'thinking' ? t('chat.streaming.thinking') : t('chat.streaming.tool')}
            </span>
          </div>
        ) : isStreaming ? (
          <span
            className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-foreground/40 align-middle"
            aria-hidden={true}
          />
        ) : null}
      </div>
    </div>
  );
}
