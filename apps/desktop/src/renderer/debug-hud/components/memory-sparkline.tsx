/**
 * Sparkline SVG inline para histórico de memória — sem dep externa.
 * Plota `heapUsed` ao longo do tempo. Usado tanto na overview quanto
 * na tab dedicada de memória (mesmo componente, dimensões diferentes).
 */

import { useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';
import type { MemorySample } from '../../../debug-hud-types.ts';

interface MemorySparklineProps {
  readonly samples: readonly MemorySample[];
  readonly width: number;
  readonly height: number;
  readonly tone?: 'ok' | 'warn' | 'critical';
}

const STROKE: Record<NonNullable<MemorySparklineProps['tone']>, string> = {
  ok: 'rgb(16 185 129 / 0.9)',
  warn: 'rgb(245 158 11 / 0.9)',
  critical: 'rgb(244 63 94 / 0.9)',
};

const FILL: Record<NonNullable<MemorySparklineProps['tone']>, string> = {
  ok: 'rgb(16 185 129 / 0.12)',
  warn: 'rgb(245 158 11 / 0.12)',
  critical: 'rgb(244 63 94 / 0.12)',
};

export function MemorySparkline({
  samples,
  width,
  height,
  tone = 'ok',
}: MemorySparklineProps): ReactNode {
  const { t } = useTranslate();

  if (samples.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-muted-foreground"
        style={{ width, height }}
      >
        {t('debugHud.memorySparkline.collecting')}
      </div>
    );
  }

  const values = samples.map((s) => s.heapUsed);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (samples.length - 1);

  const points = samples.map((s, i) => {
    const x = i * stepX;
    const y = height - ((s.heapUsed - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const fillD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t('debugHud.memorySparkline.aria')}
    >
      <path d={fillD} fill={FILL[tone]} />
      <path d={pathD} fill="none" stroke={STROKE[tone]} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
