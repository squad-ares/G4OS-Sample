import { useTranslate } from '@g4os/ui';
import { HelpCircle } from 'lucide-react';
import { shellNavigationEntries } from '../navigation.ts';

export interface WorkspaceSidebarProps {
  readonly activePath: string;
  readonly onNavigate: (to: string) => void;
  readonly onOpenSupport?: () => void;
}

export function WorkspaceSidebar({ activePath, onNavigate, onOpenSupport }: WorkspaceSidebarProps) {
  const { t } = useTranslate();
  const railEntries = shellNavigationEntries.filter((entry) => entry.placement === 'rail');

  return (
    <aside
      aria-label={t('shell.sidebar.ariaLabel')}
      className="flex h-full w-14 shrink-0 flex-col items-center gap-2 overflow-hidden border-r border-foreground/10 bg-foreground-2 py-3 pt-12"
    >
      <div className="titlebar-no-drag mb-1 flex size-9 items-center justify-center rounded-[11px] bg-foreground text-xs font-semibold tracking-wide text-background">
        {t('app.mark')}
      </div>

      <div className="my-1 h-px w-6 bg-foreground/8" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pb-1">
        {railEntries.map((entry) => {
          const isActive = activePath === entry.to || activePath.startsWith(`${entry.to}/`);
          const Icon = entry.icon;
          const label = t(entry.labelKey);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onNavigate(entry.to)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              title={label}
              className={`titlebar-no-drag flex size-9 items-center justify-center rounded-[11px] transition-colors ${
                isActive
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-foreground/60 hover:bg-foreground/6 hover:text-foreground'
              }`}
            >
              <Icon className="size-4" aria-hidden={true} />
            </button>
          );
        })}
      </div>

      {onOpenSupport ? (
        <button
          type="button"
          onClick={onOpenSupport}
          aria-label={t('shell.sidebar.support')}
          title={t('shell.sidebar.support')}
          className="titlebar-no-drag flex size-9 items-center justify-center rounded-[11px] text-foreground/55 transition-colors hover:bg-foreground/6 hover:text-foreground"
        >
          <HelpCircle className="size-4" aria-hidden={true} />
        </button>
      ) : null}
    </aside>
  );
}
