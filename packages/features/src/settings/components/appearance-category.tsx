import { type Theme, useTheme, useTranslate } from '@g4os/ui';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ShellStatusPanel } from '../../shell/index.ts';

interface ThemeOption {
  readonly value: Theme;
  readonly labelKey:
    | 'settings.appearance.theme.light'
    | 'settings.appearance.theme.dark'
    | 'settings.appearance.theme.system';
  readonly Icon: typeof Sun;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'light', labelKey: 'settings.appearance.theme.light', Icon: Sun },
  { value: 'dark', labelKey: 'settings.appearance.theme.dark', Icon: Moon },
  { value: 'system', labelKey: 'settings.appearance.theme.system', Icon: Monitor },
];

export function AppearanceCategory() {
  const { t } = useTranslate();
  const { theme, resolved, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-4">
      <ShellStatusPanel
        title={t('settings.appearance.theme.title')}
        description={t('settings.appearance.theme.description')}
        badge={t('settings.category.appearance.label')}
      >
        <div className="flex flex-wrap gap-2">
          {THEME_OPTIONS.map(({ value, labelKey, Icon }) => {
            const selected = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={selected}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                  selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('settings.appearance.theme.active', { resolved })}
        </p>
      </ShellStatusPanel>

      <ShellStatusPanel
        title={t('settings.appearance.density.title')}
        description={t('settings.appearance.density.description')}
        tone="warning"
      >
        <p className="text-xs text-muted-foreground">{t('settings.category.plannedBadge')}</p>
      </ShellStatusPanel>
    </div>
  );
}
