/**
 * Tab "IPC + Sessões" — top procedures por volume + p95, e sessões
 * em vôo com botão de cancelamento individual. Strings via TranslationKey.
 */

import type { IpcSnapshot } from '@g4os/observability/ipc';
import type { ListenerLeakSnapshot } from '@g4os/observability/memory';
import { Button, useTranslate } from '@g4os/ui';
import { Square } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SessionsSnapshot } from '../../../debug-hud-types.ts';
import { fmtDuration } from '../format.ts';
import type { HudActions } from '../use-hud-actions.ts';
import { Card, StatRow } from './card.tsx';
import { MetricLabel } from './metric-label.tsx';

interface TabIpcProps {
  readonly ipc: IpcSnapshot;
  readonly sessions: SessionsSnapshot;
  readonly listeners: ListenerLeakSnapshot;
  readonly actions: HudActions;
  readonly onActionResult: (
    label: string,
    ok: boolean,
    messageKey?: string,
    params?: Record<string, string | number>,
  ) => void;
}

export function TabIpc({
  ipc,
  sessions,
  listeners,
  actions,
  onActionResult,
}: TabIpcProps): ReactNode {
  const { t } = useTranslate();
  const ipcTone =
    ipc.errorRate > 0.05 || ipc.p95Ms > 2500
      ? 'critical'
      : ipc.p95Ms > 1000 || ipc.errorRate > 0
        ? 'warn'
        : 'ok';

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

  return (
    <div className="space-y-4">
      <Card
        title={t('debugHud.tabIpc.procedures.title')}
        tone={ipcTone}
        subtitle={t('debugHud.tabIpc.procedures.subtitle', {
          rate: ipc.reqPerSec.toFixed(1),
          total: ipc.totalCount.toLocaleString(),
        })}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mb-3">
          <div className="space-y-0.5">
            <MetricLabel id="ipc.p50" label={t('debugHud.tabIpc.procedures.metricP50')} />
            <p className="text-sm font-mono tabular-nums">{ipc.p50Ms.toFixed(0)} ms</p>
          </div>
          <div className="space-y-0.5">
            <MetricLabel id="ipc.p95" label={t('debugHud.tabIpc.procedures.metricP95')} />
            <p className="text-sm font-mono tabular-nums">{ipc.p95Ms.toFixed(0)} ms</p>
          </div>
          <div className="space-y-0.5">
            <MetricLabel
              id="ipc.error-count"
              label={t('debugHud.tabIpc.procedures.metricErrors')}
            />
            <p className="text-sm font-mono tabular-nums">{ipc.errorCount}</p>
          </div>
          <div className="space-y-0.5">
            <MetricLabel id="ipc.error-rate" label={t('debugHud.tabIpc.procedures.metricRate')} />
            <p className="text-sm font-mono tabular-nums">{(ipc.errorRate * 100).toFixed(1)}%</p>
          </div>
        </div>
        {ipc.topPaths.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('debugHud.tabIpc.procedures.empty')}</p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-foreground/10 pb-1.5">
              <span>{t('debugHud.tabIpc.procedures.tableProcedure')}</span>
              <span className="text-right">{t('debugHud.tabIpc.procedures.tableCalls')}</span>
              <span className="text-right">{t('debugHud.tabIpc.procedures.tableP95')}</span>
              <span className="text-right">{t('debugHud.tabIpc.procedures.tableErrors')}</span>
            </div>
            {ipc.topPaths.map((p) => (
              <div
                key={p.path}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-xs py-1"
              >
                <span className="font-mono truncate" title={p.path}>
                  {p.path}
                </span>
                <span className="text-right tabular-nums">{p.count.toLocaleString()}</span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {p.p95Ms.toFixed(0)}ms
                </span>
                <span
                  className={`text-right tabular-nums ${p.errors > 0 ? 'text-rose-500' : 'text-muted-foreground'}`}
                >
                  {p.errors}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={t('debugHud.tabIpc.activeTurns.title')}
        subtitle={t('debugHud.tabIpc.activeTurns.subtitle', { count: sessions.activeCount })}
        actions={
          sessions.activeCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                void handle(t('debugHud.tabIpc.activeTurns.cancelAll'), actions.cancelAllTurns)
              }
              className="h-7 gap-1.5 text-xs"
            >
              <Square className="size-3.5" />
              {t('debugHud.tabIpc.activeTurns.cancelAll')}
            </Button>
          ) : null
        }
      >
        {sessions.active.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {t('debugHud.tabIpc.activeTurns.empty')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {sessions.active.map((row) => (
              <div
                key={`${row.sessionId}-${row.turnId}`}
                className="flex items-center justify-between gap-3 rounded-md border border-foreground/10 bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate">{row.sessionId}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {t('debugHud.tabIpc.activeTurns.startedAgo', {
                      turnId: row.turnId.slice(0, 8),
                      duration: fmtDuration(Date.now() - row.startedAt),
                    })}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void handle(t('debugHud.tabIpc.activeTurns.cancel'), () =>
                      actions.cancelTurn(row.sessionId),
                    )
                  }
                  className="h-7 gap-1.5 text-xs"
                >
                  <Square className="size-3" />
                  {t('debugHud.tabIpc.activeTurns.cancel')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={t('debugHud.tabIpc.listeners.title')}
        subtitle={t('debugHud.tabIpc.listeners.subtitle', {
          total: listeners.total,
          stale: listeners.stale.length,
        })}
        actions={
          listeners.stale.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                void handle(t('debugHud.tabIpc.listeners.recycle'), actions.resetListeners)
              }
              className="h-7 gap-1.5 text-xs"
            >
              {t('debugHud.tabIpc.listeners.recycle')}
            </Button>
          ) : null
        }
      >
        {listeners.byEvent.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {t('debugHud.tabIpc.listeners.empty')}
          </p>
        ) : (
          <div className="space-y-1">
            {listeners.byEvent.map((entry) => (
              <StatRow key={entry.event} label={entry.event} value={entry.count} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
