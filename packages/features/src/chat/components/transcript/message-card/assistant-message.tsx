import { useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';
import type { Message } from '../../../types.ts';
import { MarkdownRenderer } from '../markdown/markdown-renderer.tsx';
import { ThinkingBlock } from './thinking-block.tsx';
import { ToolUseBlock } from './tool-use-block.tsx';

interface AssistantMessageProps {
  readonly message: Message;
  readonly isStreaming?: boolean;
  /**
   * CR-29 F-CR29-1: slot opcional renderizado no footer do container
   * (copy/retry/branch). Hover-revealed via parent `group-hover` — o
   * `MessageCard` controla a visibilidade. Inline no footer, NÃO absolute,
   * pra evitar overlap com mensagens vizinhas.
   */
  readonly actions?: ReactNode;
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
  // Ghost recém-criado em `turn.started` traz `[{ type: 'text', text: '' }]`
  // — antes do primeiro chunk de texto chegar. Sem este branch, statusKey
  // retornava null e a UI mostrava só o cursor pulsing num espaço vazio,
  // sem feedback de "modelo pensando". Agora exibimos os dots + label.
  if (last.type === 'text' && last.text.length === 0) return 'thinking';
  return null;
}

/**
 * CR-29 F-CR29-2: container subtle ao redor do conteúdo do assistant —
 * paridade V1 (`TurnCard.tsx:2266`):
 *
 *   `select-text rounded-[12px] bg-foreground/[0.02] px-1 -mx-1`
 *
 * O `bg-foreground/[0.02]` é tint quase imperceptível mas dá noção de
 * "box" pra resposta. Padding interno aumenta breathing room. Margin
 * vertical (`py-2`) entre mensagens evita ações hover ficarem coladas.
 *
 * Esta paridade era 0 antes — V2 renderizava texto raw sem qualquer
 * differentiação visual. Usuário relatou explicitamente que o box estava
 * divergente da V1.
 */
export function AssistantMessage({ message, isStreaming, actions }: AssistantMessageProps) {
  const { t } = useTranslate();
  const lastIdx = message.content.length - 1;
  const statusKey = isStreaming ? inferStreamingStatusKey(message) : null;

  return (
    <div className="px-4 py-2">
      <div className="relative select-text rounded-[12px] bg-foreground/[0.02] px-3 py-2 text-sm text-foreground">
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
          <div className="flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground">
            <span className="flex gap-1" aria-hidden={true}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-delay:200ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-delay:400ms]" />
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
        {actions ? (
          // CR-29 F-CR29-4: chip ABSOLUTE ancorado no canto inferior-direito
          // do box. NÃO inline (footer). A versão inline com `mt-2 border-t`
          // reservava ~32px abaixo do conteúdo mesmo com opacity-0, gerando
          // a "região vazia" reportada. Absolute solta o chip do flow:
          // espaço só ocupado quando o usuário hover (mesmo padrão do
          // user-message). `-bottom-2 right-2` cabe dentro do `py-2` outer
          // (8px) sem invadir a próxima mensagem.
          <div className="pointer-events-none absolute -bottom-2 right-2 flex items-center gap-0.5 rounded-md border border-foreground/10 bg-background px-0.5 py-0.5 opacity-0 shadow-sm transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
