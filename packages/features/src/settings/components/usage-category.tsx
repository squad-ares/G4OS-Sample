import { StatusPanel, useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';

/**
 * UsageCategory — placeholder transparente até backend de billing/metrics
 * estar pronto. Em V1 mostrava token count + gráfico 30d + budget warning.
 *
 * Por enquanto expõe 3 painéis informativos: current (stats vazios), budget
 * (sem limite configurado) e export (botão desabilitado). Todos com badge
 * `Em breve` pra deixar claro que o backend real vem depois.
 */
export function UsageCategory(): ReactNode {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col gap-4">
      <StatusPanel
        title={t('settings.usage.currentMonth.title')}
        description={t('settings.usage.currentMonth.description')}
        badge={t('settings.comingSoon')}
      >
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label={t('settings.usage.stats.tokensIn')} value="—" />
          <Stat label={t('settings.usage.stats.tokensOut')} value="—" />
          <Stat label={t('settings.usage.stats.turns')} value="—" />
        </div>
      </StatusPanel>

      <StatusPanel
        title={t('settings.usage.budget.title')}
        description={t('settings.usage.budget.description')}
        badge={t('settings.comingSoon')}
      >
        <p className="text-xs text-muted-foreground italic">
          {t('settings.usage.budget.placeholder')}
        </p>
      </StatusPanel>

      <StatusPanel
        title={t('settings.usage.export.title')}
        description={t('settings.usage.export.description')}
        badge={t('settings.comingSoon')}
      />
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
