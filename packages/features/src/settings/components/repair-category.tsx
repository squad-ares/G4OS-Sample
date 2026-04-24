import { useTranslate } from '@g4os/ui';
import { ShellStatusPanel } from '../../shell/index.ts';

export interface RepairCategoryProps {
  readonly appVersion: string;
  readonly platform: string;
  readonly onReloadApp: () => void;
  readonly onClearQueryCache: () => void;
}

export function RepairCategory({
  appVersion,
  platform,
  onReloadApp,
  onClearQueryCache,
}: RepairCategoryProps) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <ShellStatusPanel
        title={t('settings.repair.diagnostics.title')}
        description={t('settings.repair.diagnostics.description')}
        badge={t('settings.category.repair.label')}
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <Row label={t('settings.repair.diagnostics.appVersion')} value={appVersion || '—'} />
          <Row label={t('settings.repair.diagnostics.platform')} value={platform || '—'} />
        </dl>
      </ShellStatusPanel>

      <ShellStatusPanel
        title={t('settings.repair.softReset.title')}
        description={t('settings.repair.softReset.description')}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClearQueryCache}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-accent"
          >
            {t('settings.repair.softReset.clearCache')}
          </button>
          <button
            type="button"
            onClick={onReloadApp}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-accent"
          >
            {t('settings.repair.softReset.reload')}
          </button>
        </div>
      </ShellStatusPanel>

      <ShellStatusPanel
        title={t('settings.repair.destructive.title')}
        description={t('settings.repair.destructive.description')}
        tone="warning"
      >
        <p className="text-xs text-muted-foreground">
          {t('settings.category.plannedBadge')} · {t('settings.repair.destructive.planned')}
        </p>
      </ShellStatusPanel>
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </>
  );
}
