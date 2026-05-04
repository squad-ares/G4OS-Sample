/**
 * Barra de progresso colorida com bandas semânticas.
 * Resolve o problema do usuário leigo ver "832 MB" e não saber se
 * é alto ou baixo: a barra mostra contexto visual (verde/amarelo/vermelho)
 * em relação aos limites configurados.
 *
 * Cada `band` define { max, tone }; o valor cai na primeira banda cujo
 * `max` cobre. Última banda é o teto da escala.
 */

import { cn } from '@g4os/ui';
import type { ReactNode } from 'react';

export type ThresholdTone = 'ok' | 'warn' | 'critical';

export interface ThresholdBand {
  readonly max: number;
  readonly tone: ThresholdTone;
}

interface ThresholdBarProps {
  readonly value: number;
  readonly bands: readonly ThresholdBand[];
  readonly label?: string;
  readonly description?: string;
  readonly format?: (n: number) => string;
  readonly className?: string;
}

const FILL_TONE: Record<ThresholdTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  critical: 'bg-rose-500',
};

const TEXT_TONE: Record<ThresholdTone, string> = {
  ok: 'text-emerald-500',
  warn: 'text-amber-500',
  critical: 'text-rose-500',
};

function pickTone(value: number, bands: readonly ThresholdBand[]): ThresholdTone {
  for (const band of bands) {
    if (value <= band.max) return band.tone;
  }
  return bands[bands.length - 1]?.tone ?? 'ok';
}

export function ThresholdBar({
  value,
  bands,
  label,
  description,
  format,
  className,
}: ThresholdBarProps): ReactNode {
  const max = bands[bands.length - 1]?.max ?? value;
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const tone = pickTone(value, bands);
  const display = format ? format(value) : String(value);

  return (
    <div className={cn('space-y-1', className)}>
      {label || description ? (
        <div className="flex items-baseline justify-between gap-3">
          {label ? <span className="text-xs text-muted-foreground">{label}</span> : <span />}
          <span className={cn('text-sm font-mono tabular-nums', TEXT_TONE[tone])}>{display}</span>
        </div>
      ) : null}
      <div
        className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', FILL_TONE[tone])}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {description ? <p className="text-[10px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}
