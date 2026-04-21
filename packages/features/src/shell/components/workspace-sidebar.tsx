import { useTranslate } from '@g4os/ui';

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
}

export interface WorkspaceSidebarProps {
  readonly workspaces: readonly WorkspaceSummary[];
  readonly activeWorkspaceId?: string;
  readonly onSelect?: (workspaceId: string) => void;
  readonly onCreate?: () => void;
}

export function WorkspaceSidebar({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onCreate,
}: WorkspaceSidebarProps) {
  const { t } = useTranslate();
  return (
    <aside
      aria-label={t('shell.sidebar.ariaLabel')}
      className="flex w-23 shrink-0 flex-col border-r border-foreground/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.42))] p-4 backdrop-blur-xl"
    >
      <div className="mb-6 space-y-3">
        <div className="flex size-12 items-center justify-center rounded-[18px] bg-foreground text-base font-semibold text-background shadow-[0_16px_32px_rgba(0,31,53,0.18)]">
          {t('app.mark')}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {t('shell.sidebar.label')}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {workspaces.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-foreground/14 bg-background/76 px-3 py-4 text-center text-[11px] leading-5 text-muted-foreground">
            {t('shell.sidebar.empty')}
          </div>
        ) : null}

        {workspaces.map((ws) => {
          const initial = ws.name.trim().charAt(0).toUpperCase() || '?';
          const isActive = ws.id === activeWorkspaceId;
          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => onSelect?.(ws.id)}
              aria-label={ws.name}
              aria-current={isActive ? 'page' : undefined}
              className={`flex size-11 items-center justify-center rounded-[18px] text-sm font-medium transition-all ${
                isActive
                  ? 'bg-foreground text-background shadow-[0_16px_28px_rgba(0,31,53,0.24)]'
                  : 'border border-foreground/10 bg-background/80 text-foreground hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/6'
              }`}
            >
              {initial}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onCreate}
        aria-label={t('shell.sidebar.createWorkspace')}
        className="mt-4 flex size-11 items-center justify-center rounded-[18px] border border-dashed border-foreground/18 bg-background/76 text-lg text-foreground/70 transition-colors hover:border-accent/60 hover:bg-accent/8 hover:text-foreground"
      >
        +
      </button>
    </aside>
  );
}
