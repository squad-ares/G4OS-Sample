/**
 * Tab "Vault" — atividade do cofre de credenciais (CredentialVault).
 * Conta ops/min + lista de erros recentes com timestamp e mensagem.
 * Strings via TranslationKey.
 */

import { useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';
import type { VaultActivity, VaultSnapshot } from '../../../debug-hud-types.ts';
import { fmtTime } from '../format.ts';
import { Card } from './card.tsx';
import { MetricLabel } from './metric-label.tsx';

interface TabVaultProps {
  readonly vault: VaultSnapshot;
}

const LEVEL_COLOR: Record<string, string> = {
  trace: 'text-muted-foreground/70',
  debug: 'text-muted-foreground',
  info: 'text-sky-500',
  warn: 'text-amber-500',
  error: 'text-rose-500',
  fatal: 'text-rose-600',
};

const RECENT_ERRORS_MAX = 5;

function ActivityRow({ activity }: { activity: VaultActivity }): ReactNode {
  return (
    <div className="grid grid-cols-[auto_auto_1fr] gap-3 items-baseline text-xs py-1">
      <span className="text-muted-foreground tabular-nums">{fmtTime(activity.ts)}</span>
      <span
        className={`font-semibold uppercase text-[10px] ${LEVEL_COLOR[activity.level] ?? 'text-foreground'}`}
      >
        {activity.level}
      </span>
      <div className="min-w-0">
        {activity.key ? <span className="font-mono text-[11px] mr-2">{activity.key}</span> : null}
        <span className="text-muted-foreground break-words">{activity.msg}</span>
      </div>
    </div>
  );
}

export function TabVault({ vault }: TabVaultProps): ReactNode {
  const { t } = useTranslate();
  const errorRate = vault.counts60s.ops === 0 ? 0 : vault.counts60s.errors / vault.counts60s.ops;
  const tone =
    errorRate > 0.05 || vault.recentErrors.length > 0
      ? 'critical'
      : vault.counts60s.ops > 0
        ? 'ok'
        : 'default';

  return (
    <div className="space-y-4">
      <Card
        title={t('debugHud.tabVault.title')}
        tone={tone}
        subtitle={t('debugHud.tabVault.subtitle')}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
          <div className="space-y-0.5">
            <MetricLabel id="vault.ops" label={t('debugHud.tabVault.metric.opsPerMin')} />
            <p className="text-sm font-mono tabular-nums">{vault.counts60s.ops}</p>
          </div>
          <div className="space-y-0.5">
            <MetricLabel id="vault.errors" label={t('debugHud.tabVault.metric.errorsPerMin')} />
            <p className="text-sm font-mono tabular-nums">{vault.counts60s.errors}</p>
          </div>
          <div className="space-y-0.5">
            <MetricLabel id="vault.error-rate" label={t('debugHud.tabVault.metric.errorRate')} />
            <p className="text-sm font-mono tabular-nums">{(errorRate * 100).toFixed(1)}%</p>
          </div>
        </div>
        {vault.lastActivity ? (
          <div className="mt-3 rounded-md border border-foreground/10 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              {t('debugHud.tabVault.lastActivity')}
            </div>
            <ActivityRow activity={vault.lastActivity} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{t('debugHud.tabVault.noActivity')}</p>
        )}
      </Card>

      <Card
        title={t('debugHud.tabVault.recentErrors.title')}
        subtitle={t('debugHud.tabVault.recentErrors.subtitle', {
          count: vault.recentErrors.length,
          max: RECENT_ERRORS_MAX,
        })}
        tone={vault.recentErrors.length > 0 ? 'warn' : 'default'}
      >
        {vault.recentErrors.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {t('debugHud.tabVault.recentErrors.empty')}
          </p>
        ) : (
          <div className="space-y-1">
            {[...vault.recentErrors].reverse().map((entry, i) => (
              <ActivityRow key={i} activity={entry} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
