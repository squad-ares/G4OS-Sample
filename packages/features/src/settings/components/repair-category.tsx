import { StatusPanel, Switch, useTranslate } from '@g4os/ui';

export interface IntegrityFailureView {
  readonly code: string;
  readonly runtime?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface IntegrityReportView {
  readonly ok: boolean;
  readonly metaPresent: boolean;
  readonly metaPath?: string;
  readonly appVersion?: string;
  readonly flavor?: string;
  readonly target?: string;
  readonly builtAt?: string;
  readonly failures: readonly IntegrityFailureView[];
  readonly checkedRuntimes: number;
}

export interface RepairCategoryProps {
  readonly appVersion: string;
  readonly platform: string;
  readonly onReloadApp: () => void;
  readonly onClearQueryCache: () => void;
  /** Estado atual do Debug HUD (vindo de `preferences.getDebugHudEnabled`). */
  readonly debugHudEnabled: boolean;
  /** Toggle handler — chama `preferences.setDebugHudEnabled` no main. */
  readonly onDebugHudToggle: (enabled: boolean) => void;
  /** Em loading state (mutação em vôo) o switch desabilita pra evitar duplo-clique. */
  readonly debugHudPending?: boolean;
  /** Handler do botão "Verificar integridade". */
  readonly onVerifyIntegrity: () => void;
  /** Resultado da última verificação; `null` antes de rodar. */
  readonly integrityReport: IntegrityReportView | null;
  /** Loading state da verificação. */
  readonly integrityPending?: boolean;
}

export function RepairCategory({
  appVersion,
  platform,
  onReloadApp,
  onClearQueryCache,
  debugHudEnabled,
  onDebugHudToggle,
  debugHudPending,
  onVerifyIntegrity,
  integrityReport,
  integrityPending,
}: RepairCategoryProps) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <StatusPanel
        title={t('settings.repair.diagnostics.title')}
        description={t('settings.repair.diagnostics.description')}
        badge={t('settings.category.repair.label')}
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <Row label={t('settings.repair.diagnostics.appVersion')} value={appVersion || '—'} />
          <Row label={t('settings.repair.diagnostics.platform')} value={platform || '—'} />
        </dl>
      </StatusPanel>

      <StatusPanel
        title={t('settings.repair.integrity.title')}
        description={t('settings.repair.integrity.description')}
      >
        <div className="flex flex-col gap-3">
          <div>
            <button
              type="button"
              onClick={onVerifyIntegrity}
              disabled={integrityPending === true}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
            >
              {integrityPending
                ? t('settings.repair.integrity.checking')
                : t('settings.repair.integrity.verify')}
            </button>
          </div>
          {integrityReport ? <IntegrityReportSummary report={integrityReport} /> : null}
        </div>
      </StatusPanel>

      <StatusPanel
        title={t('settings.repair.debugHud.title')}
        description={t('settings.repair.debugHud.description')}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm">{t('settings.repair.debugHud.toggle.label')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('settings.repair.debugHud.toggle.hint')}
            </p>
          </div>
          <Switch
            checked={debugHudEnabled}
            onCheckedChange={onDebugHudToggle}
            disabled={debugHudPending === true}
            aria-label={t('settings.repair.debugHud.toggle.label')}
          />
        </div>
      </StatusPanel>

      <StatusPanel
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
      </StatusPanel>

      <StatusPanel
        title={t('settings.repair.destructive.title')}
        description={t('settings.repair.destructive.description')}
        tone="warning"
      >
        <p className="text-xs text-muted-foreground">
          {t('settings.category.plannedBadge')} · {t('settings.repair.destructive.planned')}
        </p>
      </StatusPanel>
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

function IntegrityReportSummary({ report }: { readonly report: IntegrityReportView }) {
  const { t } = useTranslate();
  const okClass = report.ok ? 'text-success' : 'text-destructive';
  return (
    <div className="rounded-md border border-foreground/10 bg-foreground-2 p-3 text-sm">
      <div className={`font-semibold ${okClass}`}>
        {report.ok
          ? t('settings.repair.integrity.ok')
          : report.metaPresent
            ? t('settings.repair.integrity.failed')
            : t('settings.repair.integrity.metaMissing')}
      </div>
      {report.metaPresent ? (
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
          {report.appVersion ? (
            <Row label={t('settings.repair.integrity.appVersion')} value={report.appVersion} />
          ) : null}
          {report.flavor ? (
            <Row label={t('settings.repair.integrity.flavor')} value={report.flavor} />
          ) : null}
          {report.target ? (
            <Row label={t('settings.repair.integrity.target')} value={report.target} />
          ) : null}
          <Row
            label={t('settings.repair.integrity.runtimes')}
            value={String(report.checkedRuntimes)}
          />
        </dl>
      ) : null}
      {report.failures.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-destructive">
            {report.failures.length}{' '}
            {report.failures.length === 1
              ? t('settings.repair.integrity.failureSingular')
              : t('settings.repair.integrity.failurePlural')}
          </summary>
          <ul className="mt-2 grid gap-2 font-mono text-xs">
            {report.failures.map((failure, idx) => (
              <li
                key={`${failure.code}-${idx}`}
                className="rounded border border-destructive/20 bg-destructive/5 p-2"
              >
                <div className="font-semibold text-destructive">{failure.code}</div>
                {failure.runtime ? (
                  <div>
                    {t('settings.repair.integrity.failureRuntime')}: {failure.runtime}
                  </div>
                ) : null}
                {failure.path ? (
                  <div>
                    {t('settings.repair.integrity.failurePath')}: {failure.path}
                  </div>
                ) : null}
                {failure.expected ? (
                  <div>
                    {t('settings.repair.integrity.failureExpected')}: {failure.expected}
                  </div>
                ) : null}
                {failure.actual ? (
                  <div>
                    {t('settings.repair.integrity.failureActual')}: {failure.actual}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
