import { useTranslate } from '@g4os/ui';
import { Code2, FileText, Lightbulb, Sparkles } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useEffect, useMemo, useState } from 'react';

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
  /**
   * Modo `novice` (workspace recém-criado, setup pendente) usa cards
   * grandes 2-col com descrição. Default usa lista compacta single-col.
   * Paridade com V1 `ChatWelcomeState` (split em `isNovice`).
   */
  readonly mode?: 'novice' | 'default';
}

const PLAYFAIR_FONT = '"Playfair Display", Georgia, "Times New Roman", serif';

/**
 * Effect typewriter — replica V1 ChatWelcomeState. Char-by-char usando
 * setInterval em vez de framer-motion (sem dep nova). 60ms/char dá
 * ritmo natural sem "lag" perceptível.
 */
function useTypewriter(text: string, charDelayMs = 60): string {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    if (!text) return;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, charDelayMs);
    return () => window.clearInterval(id);
  }, [text, charDelayMs]);
  return displayed;
}

export function WelcomeState({
  headline,
  subhead,
  prompts,
  onSelect,
  mode = 'default',
}: WelcomeStateProps) {
  const { t } = useTranslate();
  const items = useMemo(() => prompts ?? buildDefaultPrompts(t), [prompts, t]);
  const finalHeadline = headline ?? t('chat.welcome.headline');
  const typed = useTypewriter(finalHeadline);
  const isNovice = mode === 'novice';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h2
          className="h-[38px] text-[28px] font-bold leading-tight text-foreground/85"
          style={{ fontFamily: PLAYFAIR_FONT }}
        >
          {typed}
          <span
            className="ml-[2px] inline-block h-[24px] w-[2px] translate-y-[-1px] animate-cursor-blink bg-accent align-middle"
            aria-hidden={true}
          />
        </h2>
        {subhead ? <p className="mt-1 text-sm text-muted-foreground">{subhead}</p> : null}
      </div>

      {isNovice ? (
        <div className="mx-auto grid w-full max-w-[640px] gap-4 sm:grid-cols-2">
          {items.map((p, i) => {
            const Icon = p.Icon;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect?.(p)}
                style={{ animationDelay: `${120 + i * 80}ms` }}
                className="group h-full min-h-[138px] animate-fade-in-up rounded-[26px] border border-foreground/[0.10] bg-foreground/[0.06] px-5 py-4 text-left transition-colors hover:border-foreground/[0.18] hover:bg-accent/15"
              >
                <div className="flex h-full flex-col justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {Icon ? (
                      <div className="mt-0.5 w-fit rounded-xl bg-accent/12 p-2 text-accent">
                        <Icon className="size-4" aria-hidden={true} />
                      </div>
                    ) : null}
                    <div className="max-w-[22ch] text-[14px] font-semibold leading-[1.28] text-foreground/90">
                      {p.title}
                    </div>
                  </div>
                  {p.subtitle ? (
                    <div className="max-w-[33ch] pl-[42px] text-[12px] leading-[1.55] text-muted-foreground">
                      {p.subtitle}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex w-full max-w-[400px] flex-col gap-2.5">
          {items.map((p, i) => {
            const Icon = p.Icon;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect?.(p)}
                style={{ animationDelay: `${120 + i * 80}ms` }}
                className="group flex animate-fade-in-up cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-foreground/[0.03] px-4 py-3 text-left transition-colors duration-150 hover:border-foreground/[0.08] hover:bg-accent/12"
              >
                {Icon ? (
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground/60"
                    aria-hidden={true}
                  />
                ) : null}
                <span className="text-[13px] leading-snug text-foreground/65 transition-colors group-hover:text-foreground/85">
                  {p.title}
                </span>
              </button>
            );
          })}
        </div>
      )}
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
