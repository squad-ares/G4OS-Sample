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
      className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-foreground/10 bg-foreground-2 py-3"
    >
      <div className="titlebar-no-drag flex size-10 items-center justify-center rounded-[12px] bg-foreground text-xs font-semibold tracking-wide text-background">
        {t('app.mark')}
      </div>

      <div className="my-1 h-px w-8 bg-foreground/8" />

      <div className="flex flex-1 flex-col items-center gap-2">
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
              title={ws.name}
              className={`titlebar-no-drag flex size-10 items-center justify-center rounded-[12px] text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-foreground text-background'
                  : 'text-foreground/70 hover:bg-foreground/6 hover:text-foreground'
              }`}
            >
              {initial}
            </button>
          );
        })}

        {workspaces.length === 0 ? (
          <div className="mx-1 rounded-[10px] border border-dashed border-foreground/14 px-1.5 py-2 text-center text-[10px] leading-3 text-muted-foreground">
            {t('shell.sidebar.empty')}
          </div>
        ) : null}

        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            aria-label={t('shell.sidebar.createWorkspace')}
            title={t('shell.sidebar.createWorkspace')}
            className="titlebar-no-drag flex size-10 items-center justify-center rounded-[12px] border border-dashed border-foreground/15 text-base text-foreground/60 transition-colors hover:border-foreground/35 hover:text-foreground"
          >
            +
          </button>
        ) : null}
      </div>
    </aside>
  );
}
