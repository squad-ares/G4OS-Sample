import type { Workspace } from '@g4os/kernel/types';
import { Button, Popover, PopoverContent, PopoverTrigger, useTranslate } from '@g4os/ui';
import { ChevronDown, Plus, Settings } from 'lucide-react';
import { useState } from 'react';

export interface WorkspaceSwitcherProps {
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string | null;
  readonly onSelect: (id: Workspace['id']) => void;
  readonly onCreateNew: () => void;
  readonly onManage: () => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onCreateNew,
  onManage,
}: WorkspaceSwitcherProps) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  const label = active?.name ?? t('workspace.switcher.empty');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild={true}>
        <button
          type="button"
          className="titlebar-no-drag flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-xs font-medium text-foreground/85 transition-colors hover:bg-accent/12 hover:text-foreground"
          aria-label={t('workspace.switcher.ariaLabel')}
        >
          <WorkspaceBadge
            name={label}
            {...(active?.metadata.theme === undefined ? {} : { color: active.metadata.theme })}
          />
          <span className="flex-1 truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-1 p-2">
        <WorkspaceSwitcherContent
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelect={(id) => {
            onSelect(id);
            setOpen(false);
          }}
          onCreateNew={() => {
            onCreateNew();
            setOpen(false);
          }}
          onManage={() => {
            onManage();
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface WorkspaceSwitcherContentProps {
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string | null;
  readonly onSelect: (id: Workspace['id']) => void;
  readonly onCreateNew: () => void;
  readonly onManage: () => void;
}

export function WorkspaceSwitcherContent({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onCreateNew,
  onManage,
}: WorkspaceSwitcherContentProps) {
  const { t } = useTranslate();

  return (
    <div className="space-y-1">
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {t('workspace.switcher.yours')}
      </div>
      <ul
        className="max-h-64 space-y-0.5 overflow-auto"
        aria-label={t('workspace.switcher.listAriaLabel')}
      >
        {workspaces.map((workspace, index) => {
          const isActive = workspace.id === activeWorkspaceId;
          return (
            <li key={workspace.id}>
              <button
                type="button"
                onClick={() => onSelect(workspace.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors ${
                  isActive ? 'bg-foreground/8 text-foreground' : 'hover:bg-accent/10'
                }`}
              >
                <WorkspaceBadge
                  name={workspace.name}
                  {...(workspace.metadata.theme === undefined
                    ? {}
                    : { color: workspace.metadata.theme })}
                />
                <span className="flex-1 truncate">{workspace.name}</span>
                {index < 9 ? (
                  <kbd className="rounded-md bg-foreground/6 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    ⌘{index + 1}
                  </kbd>
                ) : null}
              </button>
            </li>
          );
        })}
        {workspaces.length === 0 ? (
          <li className="px-2 py-2 text-xs text-muted-foreground">
            {t('workspace.switcher.empty')}
          </li>
        ) : null}
      </ul>

      <div className="border-t border-foreground/6 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateNew}
          className="w-full justify-start gap-2"
        >
          <Plus className="size-3.5" aria-hidden={true} />
          {t('workspace.switcher.createNew')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onManage} className="w-full justify-start gap-2">
          <Settings className="size-3.5" aria-hidden={true} />
          {t('workspace.switcher.manage')}
        </Button>
      </div>
    </div>
  );
}

function WorkspaceBadge({ name, color }: { readonly name: string; readonly color?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden={true}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-background"
      style={{ backgroundColor: color ?? 'var(--foreground)' }}
    >
      {initial}
    </span>
  );
}
