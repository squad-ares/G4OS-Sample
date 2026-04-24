import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LanguageSwitcher,
  useTranslate,
} from '@g4os/ui';
import { ChevronDown, Command, HelpCircle, Keyboard, LogOut, MoreHorizontal } from 'lucide-react';

export interface SubSidebarWorkspace {
  readonly name: string;
  readonly color?: string | undefined;
  readonly onOpenSwitcher?: () => void;
}

export interface SubSidebarFooterProps {
  readonly workspace?: SubSidebarWorkspace | undefined;
  readonly onOpenSupport?: () => void;
  readonly onOpenCommandPalette?: () => void;
  readonly onOpenShortcuts?: () => void;
  readonly onSignOut?: () => void;
}

export function SubSidebarFooter({
  workspace,
  onOpenSupport,
  onOpenCommandPalette,
  onOpenShortcuts,
  onSignOut,
}: SubSidebarFooterProps) {
  const { t } = useTranslate();
  const label = t('shell.nav.workspace.switcher');
  const initial = (workspace?.name?.trim().charAt(0) ?? '?').toUpperCase();
  const hasUserMenu = onOpenCommandPalette || onOpenShortcuts || onSignOut;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={workspace?.onOpenSwitcher}
        aria-label={label}
        title={label}
        disabled={!workspace?.onOpenSwitcher}
        className="titlebar-no-drag flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-xs font-medium text-foreground/85 transition-colors enabled:hover:bg-foreground/6 enabled:hover:text-foreground disabled:cursor-default"
      >
        <span
          aria-hidden={true}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-background"
          style={{ backgroundColor: workspace?.color ?? 'var(--foreground)' }}
        >
          {initial}
        </span>
        <span className="flex-1 truncate">
          {workspace?.name ?? t('shell.nav.workspace.switcher')}
        </span>
        {workspace?.onOpenSwitcher ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
        ) : null}
      </button>

      {hasUserMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild={true}>
            <button
              type="button"
              aria-label={t('shell.header.commandPalette')}
              className="titlebar-no-drag flex size-8 shrink-0 items-center justify-center rounded-[10px] text-foreground/55 transition-colors hover:bg-foreground/6 hover:text-foreground"
            >
              <MoreHorizontal className="size-4" aria-hidden={true} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-[220px]">
            {onOpenCommandPalette ? (
              <DropdownMenuItem onClick={onOpenCommandPalette}>
                <Command className="mr-2 size-4" aria-hidden={true} />
                {t('shell.header.commandPalette')}
              </DropdownMenuItem>
            ) : null}
            {onOpenShortcuts ? (
              <DropdownMenuItem onClick={onOpenShortcuts}>
                <Keyboard className="mr-2 size-4" aria-hidden={true} />
                {t('shell.header.shortcuts')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <LanguageSwitcher variant="ghost" size="sm" />
            </div>
            {onSignOut ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="text-destructive">
                  <LogOut className="mr-2 size-4" aria-hidden={true} />
                  {t('shell.header.signOut')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {onOpenSupport ? (
        <button
          type="button"
          onClick={onOpenSupport}
          aria-label={t('shell.sidebar.support')}
          title={t('shell.sidebar.support')}
          className="titlebar-no-drag flex size-8 shrink-0 items-center justify-center rounded-[10px] text-foreground/55 transition-colors hover:bg-foreground/6 hover:text-foreground"
        >
          <HelpCircle className="size-4" aria-hidden={true} />
        </button>
      ) : null}
    </div>
  );
}
