/**
 * MigrationWizard — wizard V1→V2 com 5 estados:
 * 1) `detect` — checa se há V1 install
 * 2) `plan-review` — mostra plan + warnings + asks for masterKey se há creds
 * 3) `confirming` — preview do que vai mudar; botão Execute
 * 4) `executing` — busy state (aguarda mutate.execute)
 * 5) `done` — mostra report
 *
 * Decoupling: usa `ports` ao invés de tRPC direto pra ser testável + reusável.
 */

import { Button, Input, useTranslate } from '@g4os/ui';
import { useCallback, useEffect, useState } from 'react';

interface V1InstallShape {
  readonly path: string;
  readonly version: string | null;
  readonly flavor: 'internal' | 'public';
}

interface MigrationStepShape {
  readonly kind: 'config' | 'credentials' | 'workspaces' | 'sessions' | 'sources' | 'skills';
  readonly description: string;
  readonly count: number;
  readonly estimatedBytes: number;
}

interface MigrationPlanShape {
  readonly source: V1InstallShape;
  readonly target: string;
  readonly steps: readonly MigrationStepShape[];
  readonly estimatedSize: number;
  readonly warnings: readonly string[];
  readonly alreadyMigrated: boolean;
}

interface MigrationStepReportShape {
  readonly kind: MigrationStepShape['kind'];
  readonly itemsMigrated: number;
  readonly itemsSkipped: number;
  readonly bytesProcessed: number;
  readonly nonFatalWarnings: readonly string[];
}

interface MigrationReportShape {
  readonly source: string;
  readonly target: string;
  readonly v1Version: string | null;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly stepResults: readonly MigrationStepReportShape[];
  readonly backupPath: string | null;
  readonly success: boolean;
}

export interface MigrationPorts {
  detect(): Promise<V1InstallShape | null>;
  plan(input: { source: V1InstallShape }): Promise<MigrationPlanShape>;
  execute(input: { source: V1InstallShape; v1MasterKey?: string }): Promise<MigrationReportShape>;
}

export interface MigrationWizardProps {
  readonly ports: MigrationPorts;
  readonly onComplete: (report: MigrationReportShape) => void;
  readonly onSkip: () => void;
}

type State =
  | { kind: 'detecting' }
  | { kind: 'no-v1' }
  | { kind: 'plan-review'; v1: V1InstallShape; plan: MigrationPlanShape }
  | { kind: 'executing'; v1: V1InstallShape }
  | { kind: 'done'; report: MigrationReportShape }
  | { kind: 'error'; message: string };

export function MigrationWizard({ ports, onComplete, onSkip }: MigrationWizardProps) {
  const { t } = useTranslate();
  const [state, setState] = useState<State>({ kind: 'detecting' });
  const [masterKey, setMasterKey] = useState('');

  const detectAndPlan = useCallback(async (): Promise<void> => {
    try {
      const v1 = await ports.detect();
      if (!v1) {
        setState({ kind: 'no-v1' });
        return;
      }
      const plan = await ports.plan({ source: v1 });
      setState({ kind: 'plan-review', v1, plan });
    } catch {
      // CR-37 F-CR37-19: não expõe err.message bruto — usa chave i18n genérica.
      setState({ kind: 'error', message: t('migration.wizard.detectError') });
    }
  }, [ports, t]);

  useEffect(() => {
    void detectAndPlan();
  }, [detectAndPlan]);

  async function handleExecute(v1: V1InstallShape): Promise<void> {
    setState({ kind: 'executing', v1 });
    try {
      const report = await ports.execute({
        source: v1,
        ...(masterKey.trim().length > 0 ? { v1MasterKey: masterKey.trim() } : {}),
      });
      setState({ kind: 'done', report });
      onComplete(report);
    } catch {
      // CR-37 F-CR37-19: não expõe err.message bruto — usa chave i18n genérica.
      setState({ kind: 'error', message: t('migration.wizard.detectError') });
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl rounded-4xl border border-foreground/10 bg-background/78 p-6 shadow-[0_24px_80px_rgba(0,31,53,0.10)] backdrop-blur-xl sm:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">{t('migration.wizard.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('migration.wizard.subtitle')}</p>
        </header>

        {state.kind === 'detecting' ? <Section message={t('migration.wizard.detecting')} /> : null}

        {state.kind === 'no-v1' ? <NoV1State onSkip={onSkip} /> : null}

        {state.kind === 'plan-review' ? (
          <PlanReview
            v1={state.v1}
            plan={state.plan}
            masterKey={masterKey}
            setMasterKey={setMasterKey}
            onConfirm={() => void handleExecute(state.v1)}
            onSkip={onSkip}
          />
        ) : null}

        {state.kind === 'executing' ? <Section message={t('migration.wizard.executing')} /> : null}

        {state.kind === 'done' ? <DoneReport report={state.report} onClose={onSkip} /> : null}

        {state.kind === 'error' ? (
          <ErrorState message={state.message} onRetry={() => void detectAndPlan()} />
        ) : null}
      </div>
    </div>
  );
}

function Section({ message }: { readonly message: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 bg-background/40 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function NoV1State({ onSkip }: { readonly onSkip: () => void }) {
  const { t } = useTranslate();
  return (
    <div className="space-y-4">
      <p className="text-sm">{t('migration.wizard.noV1Found')}</p>
      <Button onClick={onSkip}>{t('migration.wizard.continueWithoutMigrate')}</Button>
    </div>
  );
}

function PlanReview({
  v1,
  plan,
  masterKey,
  setMasterKey,
  onConfirm,
  onSkip,
}: {
  readonly v1: V1InstallShape;
  readonly plan: MigrationPlanShape;
  readonly masterKey: string;
  readonly setMasterKey: (v: string) => void;
  readonly onConfirm: () => void;
  readonly onSkip: () => void;
}) {
  const { t } = useTranslate();
  const hasCredentials = plan.steps.some((s) => s.kind === 'credentials' && s.count > 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-foreground/10 bg-background/40 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('migration.wizard.detectedAt')}
        </p>
        <p className="mt-1 font-mono text-sm">{v1.path}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('migration.wizard.version')}: {v1.version ?? t('migration.wizard.versionUnknown')}
          {' · '}
          {t(`migration.wizard.flavor.${v1.flavor}`)}
        </p>
      </div>

      {plan.alreadyMigrated ? (
        <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm">
          {t('migration.wizard.alreadyMigrated')}
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {plan.steps.map((step) => (
              <li
                key={step.kind}
                className="flex items-center justify-between rounded-md border border-foreground/10 bg-background/30 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{t(`migration.wizard.steps.${step.kind}`)}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {step.count} · {fmtBytes(step.estimatedBytes)}
                </span>
              </li>
            ))}
          </ul>

          {plan.warnings.length > 0 ? (
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm">
              <p className="font-medium">{t('migration.wizard.warnings')}</p>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-xs">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasCredentials ? (
            <div className="space-y-2">
              <label htmlFor="masterKey" className="block text-sm font-medium">
                {t('migration.wizard.masterKeyLabel')}
              </label>
              <Input
                id="masterKey"
                type="password"
                value={masterKey}
                onChange={(e) => setMasterKey(e.target.value)}
                placeholder={t('migration.wizard.masterKeyPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('migration.wizard.masterKeyHelp')}</p>
            </div>
          ) : null}
        </>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          onClick={onConfirm}
          disabled={plan.alreadyMigrated || (hasCredentials && !masterKey.trim())}
        >
          {t('migration.wizard.execute')}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {t('migration.wizard.skip')}
        </Button>
      </div>
    </div>
  );
}

function DoneReport({
  report,
  onClose,
}: {
  readonly report: MigrationReportShape;
  readonly onClose: () => void;
}) {
  const { t } = useTranslate();
  const totalMigrated = report.stepResults.reduce((acc, s) => acc + s.itemsMigrated, 0);
  const totalSkipped = report.stepResults.reduce((acc, s) => acc + s.itemsSkipped, 0);
  const allWarnings = report.stepResults.flatMap((s) => s.nonFatalWarnings);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-ok/40 bg-ok/10 p-4">
        <p className="font-medium">{t('migration.wizard.successTitle')}</p>
        <p className="mt-1 text-sm">
          {totalMigrated} {t('migration.wizard.itemsMigrated')} · {totalSkipped}{' '}
          {t('migration.wizard.itemsSkipped')}
        </p>
        {report.backupPath ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('migration.wizard.backupAt')}: <span className="font-mono">{report.backupPath}</span>
          </p>
        ) : null}
      </div>

      {allWarnings.length > 0 ? (
        <details className="rounded-lg border border-foreground/10 bg-background/40 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {allWarnings.length} {t('migration.wizard.warningsLabel')}
          </summary>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-xs">
            {allWarnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {allWarnings.length > 20 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('migration.wizard.moreWarnings', { count: allWarnings.length - 20 })}
            </p>
          ) : null}
        </details>
      ) : null}

      <Button onClick={onClose}>{t('migration.wizard.close')}</Button>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslate();
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-critical/40 bg-critical/10 p-4 text-sm">
        <p className="font-medium">{t('migration.wizard.errorTitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button onClick={onRetry}>{t('migration.wizard.retry')}</Button>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
