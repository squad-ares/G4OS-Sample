/**
 * Tab "Memória" — visão detalhada com sparkline maior + breakdown
 * heap/rss/external + threshold bar de RSS + ações de mitigação
 * (liberar memória, recarregar). Cada métrica linkada ao glossário.
 */

import { Button, useTranslate } from '@g4os/ui';
import { RefreshCw, Zap } from 'lucide-react';
import type { MemorySnapshot, ProcessTreeSnapshot } from '../../../debug-hud-types.ts';
import { fmtBytes, fmtDuration } from '../format.ts';
import type { HudActions } from '../use-hud-actions.ts';
import { Card } from './card.tsx';
import { MemorySparkline } from './memory-sparkline.tsx';
import { MetricLabel } from './metric-label.tsx';
import { ThresholdBar } from './threshold-bar.tsx';

const MB = 1_048_576;

interface TabMemoryProps {
  readonly memory: MemorySnapshot;
  readonly processTree: ProcessTreeSnapshot;
  readonly actions: HudActions;
  readonly onActionResult: (
    label: string,
    ok: boolean,
    messageKey?: string,
    params?: Record<string, string | number>,
  ) => void;
}

export function TabMemory({ memory, processTree, actions, onActionResult }: TabMemoryProps) {
  const { t } = useTranslate();
  const growthMBperMin = (memory.growthRateBytesPerSec * 60) / MB;
  const tone = growthMBperMin > 5 ? 'critical' : growthMBperMin > 2 ? 'warn' : 'ok';

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

  const heapPct = (memory.current.heapUsed / memory.current.heapTotal) * 100;
  const rssMB = Math.round(memory.current.rss / MB);

  return (
    <div className="space-y-4">
      <Card
        title={t('debugHud.tabMemory.history.title')}
        tone={tone}
        subtitle={
          growthMBperMin > 0
            ? t('debugHud.tabMemory.history.growth', { value: growthMBperMin.toFixed(2) })
            : t('debugHud.tabMemory.history.stable')
        }
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handle(t('debugHud.tabMemory.releaseMemory'), actions.forceGc)}
              className="h-7 gap-1.5 text-xs"
            >
              <Zap className="size-3.5" />
              {t('debugHud.tabMemory.releaseMemory')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handle(t('debugHud.tabMemory.reload'), actions.reloadRenderer)}
              className="h-7 gap-1.5 text-xs"
            >
              <RefreshCw className="size-3.5" />
              {t('debugHud.tabMemory.reload')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-background/40 p-3">
            <MemorySparkline samples={memory.history} width={760} height={120} tone={tone} />
          </div>

          <ThresholdBar
            value={rssMB}
            bands={[
              { max: 800, tone: 'ok' },
              { max: 1500, tone: 'warn' },
              { max: 3000, tone: 'critical' },
            ]}
            label={t('debugHud.tabMemory.thresholdLabel')}
            format={(n) => `${n} MB`}
            description={t('debugHud.tabMemory.thresholdDescription')}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mt-1">
            <div className="space-y-0.5">
              <MetricLabel id="memory.heap-used" />
              <p className="text-sm font-mono tabular-nums">{fmtBytes(memory.current.heapUsed)}</p>
            </div>
            <div className="space-y-0.5">
              <MetricLabel id="memory.heap-total" />
              <p className="text-sm font-mono tabular-nums">
                {fmtBytes(memory.current.heapTotal)}{' '}
                <span className="text-[10px] text-muted-foreground">({heapPct.toFixed(0)}%)</span>
              </p>
            </div>
            <div className="space-y-0.5">
              <MetricLabel id="memory.external" />
              <p className="text-sm font-mono tabular-nums">{fmtBytes(memory.current.external)}</p>
            </div>
            <div className="space-y-0.5">
              <MetricLabel id="memory.rss" />
              <p className="text-sm font-mono tabular-nums">{fmtBytes(memory.current.rss)}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={t('debugHud.tabMemory.processes.title')}
        subtitle={t('debugHud.tabMemory.processes.subtitle')}
      >
        <div className="space-y-2">
          {processTree.nodes.map((node) => (
            <div
              key={node.pid}
              className="flex items-center justify-between gap-3 rounded-md border border-foreground/10 bg-background/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {node.kind}
                  </span>
                  <span className="font-medium truncate">{node.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    pid {node.pid}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums shrink-0">
                <span>{fmtBytes(node.rssBytes)}</span>
                <span>
                  {t('debugHud.tabMemory.processes.uptime', {
                    duration: fmtDuration(node.uptimeMs),
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
