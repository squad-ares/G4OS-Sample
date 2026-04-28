import { useTranslate } from '@g4os/ui';
import { Settings as SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SubSidebarShell } from '../../shell/index.ts';
import type { SettingsCategory, SettingsCategoryId } from '../categories.ts';

export interface SettingsPanelProps {
  readonly categories: readonly SettingsCategory[];
  readonly activeId: SettingsCategoryId | null;
  readonly onSelect: (id: SettingsCategoryId) => void;
  readonly footer?: ReactNode;
}

export function SettingsPanel({ categories, activeId, onSelect, footer }: SettingsPanelProps) {
  const { t } = useTranslate();

  const header = (
    <div className="flex items-center gap-2 px-1 pb-2">
      <span
        aria-hidden={true}
        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/10"
      >
        <SettingsIcon className="h-3.5 w-3.5" />
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {t('shell.subsidebar.title.settings')}
      </span>
    </div>
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <nav
        aria-label={t('settings.sidebar.ariaLabel')}
        className="mask-fade-bottom min-h-0 flex-1 overflow-y-auto pb-3"
      >
        <ul className="flex flex-col gap-0.5 px-2">
          {categories.map((cat) => {
            const isActive = cat.id === activeId;
            const Icon = cat.icon;
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  onClick={() => onSelect(cat.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'bg-foreground/8 text-foreground'
                      : 'text-foreground/85 hover:bg-accent/12'
                  }`}
                >
                  <span
                    aria-hidden={true}
                    className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                      isActive
                        ? 'bg-foreground/10 text-foreground'
                        : 'bg-foreground/5 text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium">{t(cat.labelKey)}</span>
                      {cat.status === 'planned' && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t('settings.category.plannedBadge')}
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {t(cat.descriptionKey)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </SubSidebarShell>
  );
}
