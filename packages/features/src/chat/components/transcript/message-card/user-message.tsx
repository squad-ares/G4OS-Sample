import { MarkdownRenderer } from '@g4os/ui/markdown';
import type { ReactNode } from 'react';
import type { Message, TextBlock } from '../../../types.ts';
import { renderUserContentWithBadges } from './user-message-badges.tsx';

interface UserMessageProps {
  readonly message: Message;
  /**
   * CR-29 F-CR29-1: slot ancorado no canto da bubble (V1 paridade
   * `UserMessageBubble.tsx:818` `absolute -bottom-1.5 -right-1.5`).
   * Hover-revealed pelo parent `group-hover` em `MessageCard`. NÃO
   * float abaixo do row pra não invadir a próxima mensagem.
   */
  readonly actions?: ReactNode;
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
export function UserMessage({ message, actions }: UserMessageProps) {
  const text = extractText(message);
  const rendered = renderUserContentWithBadges(text);
  const hasBadges = rendered !== null;

  return (
    <div className="flex justify-end px-4 py-2">
      <div className="relative ml-auto w-fit max-w-[calc(100vw-5.5rem)] rounded-[18px] bg-foreground/15 px-5 py-4 text-sm leading-relaxed text-foreground sm:max-w-[30rem] lg:max-w-[34rem]">
        {hasBadges ? (
          rendered
        ) : (
          <MarkdownRenderer
            content={text}
            className="[&_p]:m-0 [&_p]:whitespace-pre-wrap [&_a]:underline [&_code]:bg-foreground/10"
          />
        )}
        {actions ? (
          // CR-29 F-CR29-1: ancorado no canto inferior-direito da bubble
          // (V1 pattern `UserMessageBubble.tsx:818`). Chrome (bg/border/
          // shadow) + reveal opacity juntos no MESMO wrapper — sem isso,
          // o chrome ficava sempre visível como "chip fantasma" mesmo com
          // os botões opacity-0 (bug reportado: "mensagem do usuário
          // desconfigurada"). `group-hover` reage ao parent `.group` em
          // `MessageCard`. `pointer-events-none` quando invisível evita
          // grabbing acidental de cliques.
          <div className="pointer-events-none absolute -bottom-2 -right-2 flex items-center gap-0.5 rounded-md border border-foreground/10 bg-background px-0.5 py-0.5 opacity-0 shadow-sm transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
