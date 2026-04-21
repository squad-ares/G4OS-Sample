import { cn } from '@g4os/ui';
import { memo, useState } from 'react';
import type { Message, TextBlock } from '../../../types.ts';
import { BranchButton } from '../actions/branch-button.tsx';
import { CopyButton } from '../actions/copy-button.tsx';
import { RetryButton } from '../actions/retry-button.tsx';
import { AssistantMessage } from './assistant-message.tsx';
import { UserMessage } from './user-message.tsx';

export interface MessageCardCallbacks {
  readonly onRetry?: (messageId: string) => void;
  readonly onBranch?: (messageId: string) => void;
}

export interface MessageCardProps {
  readonly sessionId: string;
  readonly message: Message;
  readonly isLast: boolean;
  readonly isStreaming: boolean;
  readonly callbacks?: MessageCardCallbacks;
}

function extractText(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export const MessageCard = memo(
  function MessageCard({
    sessionId: _sessionId,
    message,
    isStreaming,
    callbacks,
  }: MessageCardProps) {
    const [hovered, setHovered] = useState(false);
    const text = extractText(message);

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: (reason: hover reveals action buttons that are keyboard accessible)
      <div
        className="group relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {message.role === 'user' && <UserMessage message={message} />}
        {message.role === 'assistant' && (
          <AssistantMessage message={message} isStreaming={isStreaming} />
        )}

        {!isStreaming && text && (
          <div
            className={cn(
              'absolute -bottom-3 right-4 flex items-center gap-0.5 rounded-lg border border-foreground/10 bg-background/90 px-1 py-0.5 shadow-sm transition-opacity',
              hovered ? 'opacity-100' : 'opacity-0',
            )}
          >
            <CopyButton text={text} />
            {message.role === 'assistant' && callbacks?.onRetry && (
              <RetryButton onRetry={() => callbacks.onRetry?.(message.id)} />
            )}
            {callbacks?.onBranch && (
              <BranchButton onBranch={() => callbacks.onBranch?.(message.id)} />
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.message === next.message &&
    prev.isStreaming === next.isStreaming &&
    prev.isLast === next.isLast &&
    prev.callbacks === next.callbacks,
);
