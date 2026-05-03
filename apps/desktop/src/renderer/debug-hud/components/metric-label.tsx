/**
 * Label de métrica com tooltip explicativo.
 *
 * Encapsula a interação "termo técnico → ?  → tooltip pt-BR" pra que
 * cada card simplesmente use `<MetricLabel id="memory.rss" />` em vez
 * de hardcoded strings + tooltip wiring repetido.
 *
 * Lookup falha graciosamente: ID desconhecido renderiza como texto
 * cru, sem tooltip — UI não quebra.
 */

import { cn, Tooltip, TooltipContent, TooltipTrigger, useTranslate } from '@g4os/ui';
import { HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { GLOSSARY, type MetricId } from '../glossary.ts';

interface MetricLabelProps {
  /** F-CR31-12: tipo `MetricId` derivado do GLOSSARY — typo no id falha compile-time. */
  readonly id: MetricId;
  /** Override do label exibido (caso queira encurtar pro contexto). */
  readonly label?: string;
  readonly className?: string;
  /** Tom do label — ajusta intensidade da cor (default: muted). */
  readonly tone?: 'muted' | 'foreground';
}

export function MetricLabel({ id, label, className, tone = 'muted' }: MetricLabelProps): ReactNode {
  const { t } = useTranslate();
  const def = GLOSSARY[id];
  const text = label ?? (def ? t(def.titleKey) : id);
  const baseClass = cn(
    'inline-flex items-center gap-1',
    tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
    className,
  );

  if (!def) {
    return <span className={baseClass}>{text}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild={true}>
        <span className={cn(baseClass, 'cursor-help')}>
          {text}
          <HelpCircle className="size-3 opacity-50" aria-hidden={true} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-semibold">{t(def.titleKey)}</p>
          <p className="text-xs leading-relaxed">{t(def.descriptionKey)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
