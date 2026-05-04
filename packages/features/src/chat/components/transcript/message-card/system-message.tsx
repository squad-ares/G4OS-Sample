import { cn, useTranslate } from '@g4os/ui';
import { AlertCircle, AlertTriangle, Info, RotateCcw } from 'lucide-react';
import type { Message } from '../../../types.ts';
import { MarkdownRenderer } from '../markdown/markdown-renderer.tsx';

/**
 * SystemMessage — paridade visual com V1 `packages/ui/src/components/chat/SystemMessage.tsx`.
 *
 * V1 tinha 4 roles dedicados (`error`/`info`/`warning`/`system`). V2 unifica
 * em `role:'system'` + `metadata.systemKind`. Esse componente renderiza as 4
 * variantes:
 *
 *   - `error`   — `bg-destructive/5` + border tinted + ícone AlertCircle.
 *                 Inclui RetryButton inline quando `onRetry` é provido.
 *   - `warning` — `bg-amber-500/5` + border âmbar + AlertTriangle.
 *   - `info`    — bordered + bg muted, sem cor de severidade.
 *   - `system`  — fallback neutro idêntico a `info`.
 *
 * Conteúdo via `MarkdownRenderer` para suportar links/bold/code do payload
 * de erro do AgentError (ex.: "Invalid API key — please check your Anthropic
 * key in **Settings > Agents**").
 */

interface SystemMessageProps {
  readonly message: Message;
  readonly onRetry?: () => void;
}

interface VariantStyle {
  readonly container: string;
  readonly icon: typeof AlertCircle;
  readonly iconClass: string;
  readonly titleKey:
    | 'chat.systemMessage.errorTitle'
    | 'chat.systemMessage.warningTitle'
    | 'chat.systemMessage.infoTitle'
    | null;
}

const VARIANT: Record<NonNullable<Message['systemKind']> | 'system', VariantStyle> = {
  error: {
    container: 'border-destructive/25 bg-destructive/5 text-foreground',
    icon: AlertCircle,
    iconClass: 'text-destructive',
    titleKey: 'chat.systemMessage.errorTitle',
  },
  warning: {
    container: 'border-amber-500/30 bg-amber-500/5 text-foreground',
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
    titleKey: 'chat.systemMessage.warningTitle',
  },
  info: {
    container: 'border-foreground/10 bg-muted/30 text-muted-foreground',
    icon: Info,
    iconClass: 'text-muted-foreground',
    titleKey: 'chat.systemMessage.infoTitle',
  },
  system: {
    container: 'border-foreground/10 bg-muted/30 text-muted-foreground',
    icon: Info,
    iconClass: 'text-muted-foreground',
    titleKey: null,
  },
};

function extractText(message: Message): string {
  return message.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export function SystemMessage({ message, onRetry }: SystemMessageProps) {
  const { t } = useTranslate();
  const kind = message.systemKind ?? 'system';
  const variant = VARIANT[kind];
  const Icon = variant.icon;
  const text = extractText(message);
  const showRetry = kind === 'error' && onRetry !== undefined;

  return (
    <div className="px-4 py-1.5">
      <div className={cn('rounded-md border px-3 py-2 text-sm shadow-sm', variant.container)}>
        <div className="flex items-start gap-2">
          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', variant.iconClass)} aria-hidden={true} />
          <div className="min-w-0 flex-1">
            {variant.titleKey ? (
              <div className="mb-0.5 text-[12px] font-semibold uppercase tracking-wide opacity-80">
                {t(variant.titleKey)}
                {message.errorCode ? (
                  <span className="ml-1.5 font-mono text-[10px] opacity-60">
                    {message.errorCode}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="text-sm leading-relaxed">
              <MarkdownRenderer content={text} />
            </div>
          </div>
          {showRetry ? (
            <button
              type="button"
              onClick={onRetry}
              aria-label={t('chat.systemMessage.retry')}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-destructive/10 px-2 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/15"
            >
              <RotateCcw className="h-3 w-3" />
              {t('chat.systemMessage.retry')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
