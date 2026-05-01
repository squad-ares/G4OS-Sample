import { MarkdownRenderer } from '@g4os/ui/markdown';
import type { Message, TextBlock } from '../../../types.ts';
import { renderUserContentWithBadges } from './user-message-badges.tsx';

interface UserMessageProps {
  readonly message: Message;
}

function extractText(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * Padding/bg/radius alinhados com V1 (`UserMessageBubble.tsx:806`):
 *   `rounded-[18px] bg-foreground/15 px-5 py-4 text-sm leading-relaxed`
 *
 * Rendering:
 *   - Texto com markers (`[source:slug]`, `/command`, `[file:path]`,
 *     `@mention`) passa pelo parser `renderUserContentWithBadges` que
 *     substitui matches por pílulas inline.
 *   - Sem markers → MarkdownRenderer minimal pra preservar links/code
 *     formatting que o `<p whitespace-pre-wrap>` antigo perdia.
 *
 * Width cap close ao V1: 30rem sm, 34rem lg (texto >80% viewport fica
 * difícil de ler em monitor wide).
 */
export function UserMessage({ message }: UserMessageProps) {
  const text = extractText(message);
  const rendered = renderUserContentWithBadges(text);
  const hasBadges = rendered !== null;

  return (
    <div className="flex justify-end px-4 py-1">
      <div className="ml-auto w-fit max-w-[calc(100vw-5.5rem)] rounded-[18px] bg-foreground/15 px-5 py-4 text-sm leading-relaxed text-foreground sm:max-w-[30rem] lg:max-w-[34rem]">
        {hasBadges ? (
          rendered
        ) : (
          <MarkdownRenderer
            content={text}
            className="[&_p]:m-0 [&_p]:whitespace-pre-wrap [&_a]:underline [&_code]:bg-foreground/10"
          />
        )}
      </div>
    </div>
  );
}
