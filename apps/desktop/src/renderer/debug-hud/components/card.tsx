/**
 * Card primitivo do HUD — não há `Card` em `@g4os/ui`, então mantemos
 * uma implementação local pequena. Suporta:
 *   - `tone: 'default' | 'warn' | 'critical'` que pinta a borda esquerda
 *     com cor semântica (status discreto, sem encher o card de cor).
 *   - `actions` slot (botões secundários no topo direito).
 *   - `dense` reduz padding para uso em grid 2x2 da overview.
 */

import { cn } from '@g4os/ui';
import type { ReactNode } from 'react';

export type CardTone = 'default' | 'warn' | 'critical' | 'ok';

export interface CardProps {
  readonly title: string;
  readonly tone?: CardTone;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
  readonly dense?: boolean;
  readonly children: ReactNode;
}

const toneAccent: Record<CardTone, string> = {
  default: 'border-l-foreground/20',
  ok: 'border-l-emerald-500/70',
  warn: 'border-l-amber-500/80',
  critical: 'border-l-rose-500/80',
};

export function Card({ title, subtitle, tone = 'default', actions, dense, children }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-foreground/10 bg-background/60 border-l-4 shadow-sm',
        toneAccent[tone],
        dense ? 'p-3' : 'p-4',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-none">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground truncate">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0 flex items-center gap-1.5">{actions}</div> : null}
      </div>
      <div className={dense ? 'text-xs' : 'text-sm'}>{children}</div>
    </div>
  );
}

export interface StatRowProps {
  readonly label: string;
  readonly value: string | number;
  readonly hint?: string;
}

export function StatRow({ label, value, hint }: StatRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground truncate">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-mono tabular-nums">{value}</span>
        {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}
