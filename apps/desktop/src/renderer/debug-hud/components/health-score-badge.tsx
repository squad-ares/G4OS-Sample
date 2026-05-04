/**
 * Badge visual do Health Score (0-100) — exibido no header.
 * Indicador de 1-segundo: cor + número + label, com tooltip explicativo
 * via glossário (`debugHud.glossary.healthScore.*`).
 */

import { cn, Tooltip, TooltipContent, TooltipTrigger, useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';
import { GLOSSARY } from '../glossary.ts';
import { HEALTH_LABEL_KEY, type HealthScore } from '../health-score.ts';

interface HealthScoreBadgeProps {
  readonly score: HealthScore;
}

const TONE_CLASSES: Record<HealthScore['label'], string> = {
  saudavel: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500',
  atencao: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
  critico: 'bg-rose-500/10 border-rose-500/30 text-rose-500',
};

const RING_CLASSES: Record<HealthScore['label'], string> = {
  saudavel: 'stroke-emerald-500',
  atencao: 'stroke-amber-500',
  critico: 'stroke-rose-500',
};

function ScoreRing({ value, tone }: { value: number; tone: HealthScore['label'] }): ReactNode {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden={true}>
      <circle
        cx={11}
        cy={11}
        r={radius}
        fill="none"
        className="stroke-foreground/15"
        strokeWidth={2}
      />
      <circle
        cx={11}
        cy={11}
        r={radius}
        fill="none"
        className={RING_CLASSES[tone]}
        strokeWidth={2}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

export function HealthScoreBadge({ score }: HealthScoreBadgeProps): ReactNode {
  const { t } = useTranslate();
  const def = GLOSSARY['health.score'];
  const labelText = t(HEALTH_LABEL_KEY[score.label]);
  return (
    <Tooltip>
      <TooltipTrigger asChild={true}>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 cursor-help',
            TONE_CLASSES[score.label],
          )}
        >
          <ScoreRing value={score.value} tone={score.label} />
          <span className="text-xs font-medium">{labelText}</span>
          <span className="text-xs font-mono tabular-nums opacity-80">{score.value}</span>
        </span>
      </TooltipTrigger>
      {def ? (
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{t(def.titleKey)}</p>
            <p className="text-xs leading-relaxed">{t(def.descriptionKey)}</p>
          </div>
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
