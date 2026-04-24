import type { Message } from '../../../types.ts';
import { MarkdownRenderer } from '../markdown/markdown-renderer.tsx';
import { ThinkingBlock } from './thinking-block.tsx';

interface AssistantMessageProps {
  readonly message: Message;
  readonly isStreaming?: boolean;
}

export function AssistantMessage({ message, isStreaming }: AssistantMessageProps) {
  const lastIdx = message.content.length - 1;
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
          return null;
        })}
        {isStreaming && message.content.length === 0 && (
          <span
            className="inline-block h-4 w-2 animate-pulse rounded-sm bg-foreground/40"
            aria-hidden={true}
          />
        )}
      </div>
    </div>
  );
}
