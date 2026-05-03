/**
 * Banner de insights — mostra interpretações e CTAs de ação.
 * Renderizado no topo da tab "Visão Geral" só quando há insights ativos.
 *
 * Cada banner tem cor semântica suave + texto explicativo + botão de
 * ação opcional. Strings vêm via TranslationKey + params (interpolação).
 */

import { Button, useTranslate } from '@g4os/ui';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { Insight, InsightActionKind, InsightSeverity } from '../insights.ts';

interface InsightsBannerProps {
  readonly insights: readonly Insight[];
  readonly onAction: (kind: InsightActionKind, label: string) => void;
}

const SEVERITY_TONE: Record<InsightSeverity, { bg: string; border: string; iconColor: string }> = {
  critical: {
    bg: 'bg-rose-500/8',
    border: 'border-rose-500/30',
    iconColor: 'text-rose-500',
  },
  warn: {
    bg: 'bg-amber-500/8',
    border: 'border-amber-500/30',
    iconColor: 'text-amber-500',
  },
  info: {
    bg: 'bg-sky-500/8',
    border: 'border-sky-500/30',
    iconColor: 'text-sky-500',
  },
};

function SeverityIcon({ severity, className }: { severity: InsightSeverity; className: string }) {
  if (severity === 'critical') return <AlertCircle className={className} aria-hidden={true} />;
  if (severity === 'warn') return <AlertTriangle className={className} aria-hidden={true} />;
  return <Info className={className} aria-hidden={true} />;
}

export function InsightsBanner({ insights, onAction }: InsightsBannerProps) {
  const { t } = useTranslate();
  if (insights.length === 0) return null;
  return (
    <div className="space-y-2">
      {insights.map((insight) => {
        const tone = SEVERITY_TONE[insight.severity];
        const actionLabel = insight.action ? t(insight.action.labelKey) : null;
        return (
          <div
            key={insight.id}
            className={`rounded-lg border ${tone.border} ${tone.bg} px-4 py-3 flex items-start gap-3`}
          >
            <SeverityIcon
              severity={insight.severity}
              className={`size-5 shrink-0 mt-0.5 ${tone.iconColor}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">
                {t(insight.titleKey, insight.params)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t(insight.descriptionKey, insight.params)}
              </p>
            </div>
            {insight.action && actionLabel ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (insight.action) onAction(insight.action.kind, actionLabel);
                }}
                className="shrink-0 h-7 text-xs"
              >
                {actionLabel}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
