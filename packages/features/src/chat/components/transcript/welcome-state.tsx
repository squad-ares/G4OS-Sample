import { Code2, FileText, Lightbulb, Sparkles } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

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

const DEFAULT_PROMPTS: ReadonlyArray<SuggestedPrompt> = [
  {
    id: 'explain-code',
    title: 'Explicar código',
    subtitle: 'Cole um trecho e peça uma explicação',
    prompt: 'Explique este código linha por linha:\n\n```\n\n```',
    Icon: Code2,
  },
  {
    id: 'brainstorm',
    title: 'Brainstorm de ideias',
    subtitle: 'Liste opções para um problema',
    prompt: 'Me ajude a fazer brainstorm sobre ',
    Icon: Lightbulb,
  },
  {
    id: 'summarize',
    title: 'Resumir documento',
    subtitle: 'Pontos-chave em bullets',
    prompt: 'Resuma este texto em até 5 bullets:\n\n',
    Icon: FileText,
  },
  {
    id: 'plan',
    title: 'Planejar tarefa',
    subtitle: 'Quebrar em passos acionáveis',
    prompt: 'Quebre esta tarefa em passos concretos:\n\n',
    Icon: Sparkles,
  },
];

export function WelcomeState({ headline, subhead, prompts, onSelect }: WelcomeStateProps) {
  const items = prompts ?? DEFAULT_PROMPTS;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          {headline ?? 'Como posso ajudar hoje?'}
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
