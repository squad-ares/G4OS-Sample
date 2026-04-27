import { useTranslate } from '@g4os/ui';
import { Code2, FileText, Lightbulb, Sparkles } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useMemo } from 'react';

export interface SuggestedPrompt {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly prompt: string;
  readonly Icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface WelcomeStateProps {
  readonly headline?: string;
  readonly subhead?: string;
  readonly prompts?: ReadonlyArray<SuggestedPrompt>;
  readonly onSelect?: (prompt: SuggestedPrompt) => void;
}

export function WelcomeState({ headline, subhead, prompts, onSelect }: WelcomeStateProps) {
  const { t } = useTranslate();
  const items = useMemo(() => prompts ?? buildDefaultPrompts(t), [prompts, t]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          {headline ?? t('chat.welcome.headline')}
        </h2>
        {subhead ? <p className="mt-1 text-sm text-muted-foreground">{subhead}</p> : null}
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((p) => {
          const Icon = p.Icon;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect?.(p)}
              className="group flex items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04]"
            >
              {Icon ? (
                <Icon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                  aria-hidden={true}
                />
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{p.title}</div>
                {p.subtitle ? (
                  <div className="truncate text-xs text-muted-foreground">{p.subtitle}</div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildDefaultPrompts(
  t: ReturnType<typeof useTranslate>['t'],
): ReadonlyArray<SuggestedPrompt> {
  return [
    {
      id: 'explain-code',
      title: t('chat.welcome.prompts.explainCode.title'),
      subtitle: t('chat.welcome.prompts.explainCode.subtitle'),
      prompt: t('chat.welcome.prompts.explainCode.prompt'),
      Icon: Code2,
    },
    {
      id: 'brainstorm',
      title: t('chat.welcome.prompts.brainstorm.title'),
      subtitle: t('chat.welcome.prompts.brainstorm.subtitle'),
      prompt: t('chat.welcome.prompts.brainstorm.prompt'),
      Icon: Lightbulb,
    },
    {
      id: 'summarize',
      title: t('chat.welcome.prompts.summarize.title'),
      subtitle: t('chat.welcome.prompts.summarize.subtitle'),
      prompt: t('chat.welcome.prompts.summarize.prompt'),
      Icon: FileText,
    },
    {
      id: 'plan',
      title: t('chat.welcome.prompts.plan.title'),
      subtitle: t('chat.welcome.prompts.plan.subtitle'),
      prompt: t('chat.welcome.prompts.plan.prompt'),
      Icon: Sparkles,
    },
  ];
}
