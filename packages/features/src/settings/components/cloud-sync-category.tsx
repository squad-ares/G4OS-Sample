import { StatusPanel, useTranslate } from '@g4os/ui';
import { Cloud, HardDrive } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * CloudSyncCategory — placeholder até backend de cloud sync estar wired.
 * Em V1 permitia toggle de sync de transcripts/config, retenção e status
 * do último backup. Por enquanto apenas descreve o conceito + badge
 * `Em breve`. Nenhuma escrita é feita.
 */
export function CloudSyncCategory(): ReactNode {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col gap-4">
      <StatusPanel
        title={t('settings.cloudSync.enable.title')}
        description={t('settings.cloudSync.enable.description')}
        badge={t('settings.comingSoon')}
      >
        <div className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5">
          <Cloud className="size-5 shrink-0 text-muted-foreground" aria-hidden={true} />
          <p className="text-xs text-muted-foreground">{t('settings.cloudSync.enable.status')}</p>
        </div>
      </StatusPanel>

      <StatusPanel
        title={t('settings.cloudSync.scope.title')}
        description={t('settings.cloudSync.scope.description')}
        badge={t('settings.comingSoon')}
      >
        <ul className="flex flex-col gap-2 text-xs">
          <ScopeItem label={t('settings.cloudSync.scope.transcripts')} />
          <ScopeItem label={t('settings.cloudSync.scope.config')} />
          <ScopeItem label={t('settings.cloudSync.scope.attachments')} negative={true} />
        </ul>
      </StatusPanel>

      <StatusPanel
        title={t('settings.cloudSync.backups.title')}
        description={t('settings.cloudSync.backups.description')}
        badge={t('settings.comingSoon')}
      >
        <div className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5">
          <HardDrive className="size-5 shrink-0 text-muted-foreground" aria-hidden={true} />
          <p className="text-xs text-muted-foreground">{t('settings.cloudSync.backups.status')}</p>
        </div>
      </StatusPanel>
    </div>
  );
}

function ScopeItem({
  label,
  negative,
}: {
  readonly label: string;
  readonly negative?: boolean;
}): ReactNode {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`size-1.5 rounded-full ${negative ? 'bg-muted-foreground/40' : 'bg-emerald-500'}`}
        aria-hidden={true}
      />
      <span className={negative ? 'text-muted-foreground line-through' : ''}>{label}</span>
    </li>
  );
}
