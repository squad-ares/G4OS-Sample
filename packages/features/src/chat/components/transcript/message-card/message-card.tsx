import { memo, type ReactNode } from 'react';
// Side-effect import: registra renderers built-in (bash/read-file/search-results) no registry global
// no `tool-renderers/registry`. Sem isto, o dispatcher cai sempre no fallback.
import '../../../tool-renderers/index.ts';
import type { Message, TextBlock } from '../../../types.ts';
import { BranchButton } from '../actions/branch-button.tsx';
import { CopyButton } from '../actions/copy-button.tsx';
import { RetryButton } from '../actions/retry-button.tsx';
import { AssistantMessage } from './assistant-message.tsx';
import { SystemMessage } from './system-message.tsx';
import { ToolMessage } from './tool-message.tsx';
import { UserMessage } from './user-message.tsx';

export interface MessageCardCallbacks {
  readonly onRetry?: (messageId: string) => void;
  readonly onBranch?: (messageId: string) => void;
  /**
   * CR-24 F-CR24-2: retry específico para system error messages — caller
   * tipicamente chama `retryLastTurn` (sem precisar de truncate por
   * messageId, já que o erro é um endpoint da timeline). Quando ausente,
   * o `SystemMessage` esconde o botão.
   */
  readonly onRetryLast?: () => void;
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
    const text = extractText(message);
    const isSystemError = message.role === 'system' && message.systemKind === 'error';

    // CR-29 F-CR29-1: ações renderizadas inline pelo role correspondente em
    // vez de absolute float `-bottom-3 right-4` que cruzava no espaço da
    // mensagem seguinte (overlap visual ruim).
    //
    // Contrato: `MessageCard` retorna apenas os botões raw (Fragment); cada
    // role-component decide chrome + posição + reveal opacity. Sem isso, o
    // chrome do wrapper externo vazava como caixinha vazia quando o
    // `opacity-0` interno escondia só os botões. A primeira tentativa
    // mantinha background/border no wrapper de user-message + opacity no
    // inner — produziu uma chip "fantasma" sempre visível na bubble.
    const showActions =
      !isStreaming && Boolean(text) && message.role !== 'tool' && message.role !== 'system';

    const actions: ReactNode = showActions ? (
      <>
        <CopyButton text={text} />
        {message.role === 'assistant' && callbacks?.onRetry && (
          <RetryButton onRetry={() => callbacks.onRetry?.(message.id)} />
        )}
        {callbacks?.onBranch && <BranchButton onBranch={() => callbacks.onBranch?.(message.id)} />}
      </>
    ) : null;

    return (
      // CR-29 F-CR29-1: `group` class habilita `group-hover:` em descendentes
      // pra reveal das ações via CSS puro (mais simples que React state).
      <div className="group relative">
        {message.role === 'user' && (
          <UserMessage message={message} {...(actions ? { actions } : {})} />
        )}
        {message.role === 'assistant' && (
          <AssistantMessage
            message={message}
            isStreaming={isStreaming}
            {...(actions ? { actions } : {})}
          />
        )}
        {message.role === 'tool' && <ToolMessage message={message} />}
        {message.role === 'system' && (
          <SystemMessage
            message={message}
            {...(isSystemError && callbacks?.onRetryLast ? { onRetry: callbacks.onRetryLast } : {})}
          />
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
