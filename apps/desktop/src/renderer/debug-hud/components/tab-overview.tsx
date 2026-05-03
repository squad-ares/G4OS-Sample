/**
 * Tab "Visão Geral" — primeira coisa que o usuário vê.
 *
 * Insights no topo. Logo abaixo, grid 2x2 de mini-cards com:
 *   - Threshold bars (visual de saúde: verde/amarelo/vermelho)
 *   - MetricLabel (tooltips do glossário via TranslationKey)
 *   - Hint contextual em cada card
 *   - CTA pra drill-down nas tabs específicas
 */

import { useTranslate } from '@g4os/ui';
import { Activity, AlertTriangle, Cpu, Network } from 'lucide-react';
import type { ReactNode } from 'react';
import type { HudSnapshot } from '../../../debug-hud-types.ts';
import { fmtBytes, fmtDuration } from '../format.ts';
import type { Insight, InsightActionKind } from '../insights.ts';
import { Card, StatRow } from './card.tsx';
import { InsightsBanner } from './insights-banner.tsx';
import { MemorySparkline } from './memory-sparkline.tsx';
import { MetricLabel } from './metric-label.tsx';
import { ThresholdBar } from './threshold-bar.tsx';

const MB = 1_048_576;

interface TabOverviewProps {
  readonly snapshot: HudSnapshot;
  readonly insights: readonly Insight[];
  readonly onInsightAction: (kind: InsightActionKind, label: string) => void;
  readonly onNavigate: (tab: 'memory' | 'ipc' | 'logs' | 'vault') => void;
}

function CardCta({ children, onClick }: { children: ReactNode; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

export function TabOverview({
  snapshot,
  insights,
  onInsightAction,
  onNavigate,
}: TabOverviewProps): ReactNode {
  const { t } = useTranslate();
  const growthMBperMin = (snapshot.memory.growthRateBytesPerSec * 60) / MB;
  const memoryTone =
    growthMBperMin > 5 ? 'critical' : growthMBperMin > 2 ? 'warn' : ('ok' as const);

  const ipcTone =
    snapshot.ipc.errorRate > 0.05 || snapshot.ipc.p95Ms > 2500
      ? 'critical'
      : snapshot.ipc.p95Ms > 1000 || snapshot.ipc.errorRate > 0
        ? 'warn'
        : 'ok';

  const listenersTone =
    snapshot.listeners.stale.length > 0 || snapshot.listeners.total > 100
      ? 'critical'
      : snapshot.listeners.total > 50
        ? 'warn'
        : 'ok';

  const sessionsTone = snapshot.sessions.activeCount > 5 ? 'warn' : 'ok';
  const rssMB = Math.round(snapshot.memory.current.rss / MB);

  return (
    <div className="space-y-4">
      <InsightsBanner insights={insights} onAction={onInsightAction} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card
          title={t('debugHud.tabOverview.cardMemory.title')}
          tone={memoryTone}
          subtitle={t('debugHud.tabOverview.cardMemory.subtitle')}
          actions={
            <CardCta onClick={() => onNavigate('memory')}>
              {t('debugHud.tabOverview.viewDetails')}
            </CardCta>
          }
          dense={true}
        >
          <div className="flex items-center gap-3 mb-3">
            <MemorySparkline
              samples={snapshot.memory.history}
              width={120}
              height={42}
              tone={memoryTone}
            />
            <div className="flex-1 min-w-0">
              <ThresholdBar
                value={rssMB}
                bands={[
                  { max: 800, tone: 'ok' },
                  { max: 1500, tone: 'warn' },
                  { max: 3000, tone: 'critical' },
                ]}
                format={(n) => `${n} MB`}
              />
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between gap-3 py-0.5">
              <MetricLabel id="memory.growth" />
              <span className="text-sm font-mono tabular-nums">
                {growthMBperMin.toFixed(1)} MB/min
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-0.5">
              <MetricLabel id="memory.heap-used" />
              <span className="text-sm font-mono tabular-nums">
                {fmtBytes(snapshot.memory.current.heapUsed)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
            {t('debugHud.tabOverview.cardMemory.hint')}
          </p>
        </Card>

        <Card
          title={t('debugHud.tabOverview.cardSessions.title')}
          tone={sessionsTone}
          subtitle={t('debugHud.tabOverview.cardSessions.subtitle')}
          actions={
            <CardCta onClick={() => onNavigate('ipc')}>
              {t('debugHud.tabOverview.viewDetails')}
            </CardCta>
          }
          dense={true}
        >
          {snapshot.sessions.active.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              <Activity className="size-3 inline mr-1" aria-hidden={true} />
              {t('debugHud.tabOverview.cardSessions.empty')}
            </p>
          ) : (
            <div className="space-y-1">
              {snapshot.sessions.active.slice(0, 3).map((s) => (
                <div
                  key={`${s.sessionId}-${s.turnId}`}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="truncate font-mono text-muted-foreground">
                    {s.sessionId.slice(0, 12)}…
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {fmtDuration(Date.now() - s.startedAt)}
                  </span>
                </div>
              ))}
              {snapshot.sessions.active.length > 3 ? (
                <p className="text-[10px] text-muted-foreground">
                  {t('debugHud.tabOverview.cardSessions.othersCount', {
                    count: snapshot.sessions.active.length - 3,
                  })}
                </p>
              ) : null}
            </div>
          )}
          <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
            {t('debugHud.tabOverview.cardSessions.hint')}
          </p>
        </Card>

        <Card
          title={t('debugHud.tabOverview.cardListeners.title')}
          tone={listenersTone}
          subtitle={
            snapshot.listeners.stale.length > 0
              ? t('debugHud.tabOverview.cardListeners.staleSummary', {
                  count: snapshot.listeners.stale.length,
                })
              : t('debugHud.tabOverview.cardListeners.activeSummary', {
                  count: snapshot.listeners.total,
                })
          }
          actions={<Cpu className="size-3.5 text-muted-foreground" aria-hidden={true} />}
          dense={true}
        >
          <ThresholdBar
            value={snapshot.listeners.total}
            bands={[
              { max: 50, tone: 'ok' },
              { max: 100, tone: 'warn' },
              { max: 300, tone: 'critical' },
            ]}
            label={t('debugHud.tabOverview.cardListeners.totalLabel')}
            format={(n) => String(n)}
            className="mb-2"
          />
          {snapshot.listeners.byEvent.length > 0 ? (
            <div className="space-y-0.5 mt-2">
              {snapshot.listeners.byEvent.slice(0, 3).map((entry) => (
                <StatRow key={entry.event} label={entry.event} value={entry.count} />
              ))}
            </div>
          ) : null}
          {snapshot.listeners.stale.length > 0 ? (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-500">
              <AlertTriangle className="size-3" aria-hidden={true} />
              <MetricLabel
                id="listeners.stale"
                label={t('debugHud.tabOverview.cardListeners.staleSummary', {
                  count: snapshot.listeners.stale.length,
                })}
                tone="foreground"
              />
            </div>
          ) : null}
          <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
            {t('debugHud.tabOverview.cardListeners.hint')}
          </p>
        </Card>

        <Card
          title={t('debugHud.tabOverview.cardIpc.title')}
          tone={ipcTone}
          subtitle={t('debugHud.tabOverview.cardIpc.subtitle', {
            rate: snapshot.ipc.reqPerSec.toFixed(1),
            p95: snapshot.ipc.p95Ms.toFixed(0),
          })}
          actions={<Network className="size-3.5 text-muted-foreground" aria-hidden={true} />}
          dense={true}
        >
          <ThresholdBar
            value={snapshot.ipc.p95Ms}
            bands={[
              { max: 500, tone: 'ok' },
              { max: 1500, tone: 'warn' },
              { max: 5000, tone: 'critical' },
            ]}
            label={t('debugHud.tabOverview.cardIpc.responseTime')}
            format={(n) => `${n.toFixed(0)} ms`}
            className="mb-2"
          />
          <div className="grid grid-cols-2 gap-x-3">
            <div className="flex items-center justify-between gap-2 py-0.5">
              <MetricLabel
                id="ipc.req-per-sec"
                label={t('debugHud.tabOverview.cardIpc.opsPerSec')}
              />
              <span className="text-xs font-mono tabular-nums">
                {snapshot.ipc.reqPerSec.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 py-0.5">
              <MetricLabel id="ipc.error-rate" label={t('debugHud.tabOverview.cardIpc.errors')} />
              <span className="text-xs font-mono tabular-nums">
                {(snapshot.ipc.errorRate * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
            {t('debugHud.tabOverview.cardIpc.hint')}
          </p>
        </Card>
      </div>
    </div>
  );
}
