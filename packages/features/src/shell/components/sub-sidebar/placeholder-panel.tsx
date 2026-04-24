import type { TranslationKey } from '@g4os/translate';
import { useTranslate } from '@g4os/ui';
import { SubSidebarShell } from './sub-sidebar-shell.tsx';

export interface PlaceholderPanelProps {
  readonly titleKey: TranslationKey;
  readonly footer?: React.ReactNode;
}

export function PlaceholderPanel({ titleKey, footer }: PlaceholderPanelProps) {
  const { t } = useTranslate();

  const header = (
    <div className="flex flex-col gap-1 px-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {t('shell.subsidebar.placeholder.preparing')}
      </span>
      <span className="text-base font-semibold text-foreground">{t(titleKey)}</span>
    </div>
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-xs text-muted-foreground">
          {t('shell.subsidebar.placeholder.description')}
        </p>
      </div>
    </SubSidebarShell>
  );
}
