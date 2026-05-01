import { StatusPanel, useTranslate } from '@g4os/ui';

export interface AppInfoView {
  readonly version: string;
  readonly platform: string;
  readonly isPackaged: boolean;
  readonly electronVersion: string;
  readonly nodeVersion: string;
}

export interface AppCategoryProps {
  readonly info: AppInfoView | null;
  readonly onCheckUpdates?: () => void;
  readonly updateState?: { readonly checking: boolean; readonly message?: string };
}

export function AppCategory({ info, onCheckUpdates, updateState }: AppCategoryProps) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <StatusPanel
        title={t('settings.app.runtime.title')}
        description={t('settings.app.runtime.description')}
        badge={t('settings.category.app.label')}
      >
        {info ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <Row label={t('settings.app.runtime.version')} value={info.version} />
            <Row
              label={t('settings.app.runtime.channel')}
              value={
                info.isPackaged
                  ? t('settings.app.runtime.channel.stable')
                  : t('settings.app.runtime.channel.dev')
              }
            />
            <Row label={t('settings.app.runtime.platform')} value={info.platform} />
            <Row label={t('settings.app.runtime.electron')} value={info.electronVersion || '—'} />
            <Row label={t('settings.app.runtime.node')} value={info.nodeVersion || '—'} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{t('settings.app.runtime.loading')}</p>
        )}
      </StatusPanel>

      <StatusPanel
        title={t('settings.app.updates.title')}
        description={t('settings.app.updates.description')}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCheckUpdates}
            disabled={!onCheckUpdates || updateState?.checking === true}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
          >
            {updateState?.checking
              ? t('settings.app.updates.checking')
              : t('settings.app.updates.check')}
          </button>
          {updateState?.message && (
            <p className="text-sm text-muted-foreground">{updateState.message}</p>
          )}
        </div>
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
