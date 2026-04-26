import { useTranslate } from '@g4os/ui';
import { ChevronDown } from 'lucide-react';
import { shellNavigationEntries } from '../navigation.ts';
import type { SubSidebarWorkspace } from './sub-sidebar/sub-sidebar-footer.tsx';

export interface WorkspaceSidebarProps {
  readonly activePath: string;
  readonly onNavigate: (to: string) => void;
  readonly workspace?: SubSidebarWorkspace | undefined;
}

export function WorkspaceSidebar({ activePath, onNavigate, workspace }: WorkspaceSidebarProps) {
  const { t } = useTranslate();

  const initial = (workspace?.name?.trim().charAt(0) ?? '').toUpperCase();
  const switcherLabel = workspace?.name ?? t('workspace.switcher.empty');

  return (
    <aside
      aria-label={t('shell.sidebar.ariaLabel')}
      className="flex h-full w-[78px] shrink-0 flex-col items-center gap-1 overflow-hidden bg-transparent py-3 pt-[72px]"
    >
      <div className="titlebar-no-drag mb-1 flex size-9 items-center justify-center rounded-[11px] bg-foreground text-xs font-semibold tracking-wide text-background">
        {t('app.mark')}
      </div>

      {workspace?.onOpenSwitcher ? (
        <button
          type="button"
          onClick={workspace.onOpenSwitcher}
          aria-label={t('workspace.switcher.ariaLabel')}
          title={switcherLabel}
          className="titlebar-no-drag group relative flex size-9 items-center justify-center rounded-[11px] border border-transparent text-foreground/85 transition-colors hover:border-border/45 hover:bg-foreground/[0.035]"
        >
          <span
            aria-hidden={true}
            className="flex size-6 items-center justify-center rounded-md text-[10px] font-semibold text-background"
            style={{ backgroundColor: workspace.color ?? 'var(--foreground)' }}
          >
            {initial || '?'}
          </span>
          <ChevronDown
            aria-hidden={true}
            className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-background p-px text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>
      ) : null}

      <div className="my-1 h-px w-6 bg-foreground/8" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pb-1">
        {shellNavigationEntries.map((entry) => {
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
              className={`titlebar-no-drag relative flex size-9 items-center justify-center rounded-[11px] border transition-colors ${
                isActive
                  ? 'border-border/45 bg-foreground/[0.055] text-foreground shadow-minimal'
                  : 'border-transparent text-foreground/60 hover:border-border/45 hover:bg-foreground/[0.035] hover:text-foreground'
              }`}
            >
              {isActive ? (
                <span
                  aria-hidden={true}
                  className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-full bg-accent"
                />
              ) : null}
              <Icon className="size-4" aria-hidden={true} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
