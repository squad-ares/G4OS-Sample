import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, useTranslate } from '@g4os/ui';
import { SquarePen } from 'lucide-react';
import type { ReactNode } from 'react';
import { shellNavigationEntries } from '../navigation.ts';
import type { SubSidebarWorkspace } from './sub-sidebar/sub-sidebar-footer.tsx';

export interface WorkspaceSidebarProps {
  readonly activePath: string;
  readonly onNavigate: (to: string) => void;
  readonly onNewSession?: () => void;
  /** Reservado para badges/indicators futuros do workspace ativo. O switcher
   *  vive no rodapé da sub-sidebar — não duplicar aqui. */
  readonly workspace?: SubSidebarWorkspace | undefined;
}

// Wrapper Radix com `delayDuration={300}` (mais responsivo que o default 700ms
// nativo do `title=` do browser) e side="right" porque a sidebar é vertical à
// esquerda. Sem `TooltipProvider` os Triggers viram no-op silenciosos.
function SidebarTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild={true}>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function WorkspaceSidebar({ activePath, onNavigate, onNewSession }: WorkspaceSidebarProps) {
  const { t } = useTranslate();

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        aria-label={t('shell.sidebar.ariaLabel')}
        className="titlebar-no-drag flex h-full w-[78px] shrink-0 flex-col items-center gap-1 overflow-hidden bg-transparent py-3 pt-[72px]"
      >
        <div className="titlebar-no-drag mb-1 flex size-9 items-center justify-center rounded-[11px] bg-foreground text-xs font-semibold tracking-wide text-background">
          {t('app.mark')}
        </div>

        <div className="my-1 h-px w-6 bg-foreground/8" />

        {onNewSession ? (
          <SidebarTooltip label={t('shell.action.newSession.label')}>
            <button
              type="button"
              onClick={onNewSession}
              aria-label={t('shell.action.newSession.label')}
              className="titlebar-no-drag flex size-9 cursor-pointer items-center justify-center rounded-[11px] border border-transparent bg-background text-foreground shadow-minimal transition-colors hover:border-border/45 hover:bg-accent/12"
            >
              <SquarePen className="size-4" aria-hidden={true} />
            </button>
          </SidebarTooltip>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pb-1">
          {shellNavigationEntries.map((entry) => {
            const isActive = activePath === entry.to || activePath.startsWith(`${entry.to}/`);
            const Icon = entry.icon;
            const label = t(entry.labelKey);
            return (
              <SidebarTooltip key={entry.id} label={label}>
                <button
                  type="button"
                  onClick={() => onNavigate(entry.to)}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`titlebar-no-drag relative flex size-9 cursor-pointer items-center justify-center rounded-[11px] border transition-colors ${
                    isActive
                      ? 'border-border/45 bg-foreground/[0.055] text-foreground shadow-minimal'
                      : 'border-transparent text-foreground/60 hover:border-border/45 hover:bg-accent/10 hover:text-foreground'
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
              </SidebarTooltip>
            );
          })}
        </div>
      </aside>
    </TooltipProvider>
  );
}
