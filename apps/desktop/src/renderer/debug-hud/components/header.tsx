/**
 * Header do HUD com Health Score, ações globais e botão Reportar.
 *
 * Health Score (0-100) substitui o badge severity-only — usuário leigo
 * vê o número direto em cor + label e tem resposta de "tudo OK?" em
 * 1 segundo. Detalhes via tooltip do glossário.
 *
 * Ações globais: Liberar memória (force-gc), Recarregar (reload),
 * Reportar problema (modal). Tudo via TranslationKey.
 */

import { Button, Tooltip, TooltipContent, TooltipTrigger, useTranslate } from '@g4os/ui';
import { LifeBuoy, RefreshCw, Zap } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { fmtDuration } from '../format.ts';
import type { HealthScore } from '../health-score.ts';
import type { Insight } from '../insights.ts';
import type { HudActions } from '../use-hud-actions.ts';
import { HealthScoreBadge } from './health-score-badge.tsx';
import { ReportProblemDialog } from './report-problem-dialog.tsx';

interface HeaderProps {
  readonly uptimeMs: number;
  readonly insights: readonly Insight[];
  readonly healthScore: HealthScore;
  readonly actions: HudActions;
  readonly onActionResult: (
    label: string,
    ok: boolean,
    messageKey?: string,
    params?: Record<string, string | number>,
  ) => void;
}

function HeaderButton({
  onClick,
  icon,
  label,
  tooltip,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tooltip?: string;
}) {
  const button = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      className="h-7 gap-1.5 px-2 text-xs"
    >
      {icon}
      {label}
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild={true}>{button}</TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function HudHeader({
  uptimeMs,
  insights,
  healthScore,
  actions,
  onActionResult,
}: HeaderProps): ReactNode {
  const { t } = useTranslate();
  const [reportOpen, setReportOpen] = useState(false);

  const handle = async (
    label: string,
    fn: () => Promise<{
      ok: boolean;
      messageKey?: string;
      params?: Record<string, string | number>;
    }>,
  ): Promise<void> => {
    const res = await fn();
    onActionResult(label, res.ok, res.messageKey, res.params);
  };

  const alertText =
    insights.length === 0
      ? null
      : insights.length === 1
        ? t('debugHud.header.alertsOne', { count: insights.length })
        : t('debugHud.header.alertsMany', { count: insights.length });

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold whitespace-nowrap">{t('debugHud.app.title')}</h1>
          <HealthScoreBadge score={healthScore} />
          {alertText ? (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{alertText}</span>
          ) : null}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {t('debugHud.header.uptime', { duration: fmtDuration(uptimeMs) })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <HeaderButton
            onClick={() => void handle(t('debugHud.header.releaseMemory'), actions.forceGc)}
            icon={<Zap className="size-3.5" />}
            label={t('debugHud.header.releaseMemory')}
            tooltip={t('debugHud.header.tooltip.releaseMemory')}
          />
          <HeaderButton
            onClick={() => void handle(t('debugHud.header.reload'), actions.reloadRenderer)}
            icon={<RefreshCw className="size-3.5" />}
            label={t('debugHud.header.reload')}
            tooltip={t('debugHud.header.tooltip.reload')}
          />
          <HeaderButton
            onClick={() => setReportOpen(true)}
            icon={<LifeBuoy className="size-3.5" />}
            label={t('debugHud.header.report')}
            tooltip={t('debugHud.header.tooltip.report')}
          />
        </div>
      </div>
      <ReportProblemDialog open={reportOpen} onOpenChange={setReportOpen} actions={actions} />
    </>
  );
}
