import { useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';
import { AppHeader, type AppHeaderProps } from './app-header.tsx';
import { ShellNavigator } from './shell-navigator.tsx';
import { WorkspaceSidebar, type WorkspaceSidebarProps } from './workspace-sidebar.tsx';

export interface AppShellProps {
  readonly sidebar: WorkspaceSidebarProps;
  readonly header: AppHeaderProps;
  readonly navigation: {
    readonly activePath: string;
    readonly onNavigate: (to: string) => void;
  };
  readonly children: ReactNode;
}

export function AppShell({ sidebar, header, navigation, children }: AppShellProps) {
  const { t } = useTranslate();

  return (
    <div className="flex min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(185,145,91,0.15),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(0,31,53,0.10),transparent_24%),hsl(var(--background))] text-foreground">
      <a
        href="#app-main-content"
        className="sr-only rounded-full bg-foreground px-4 py-2 text-background focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-80"
      >
        {t('shell.a11y.skipToContent')}
      </a>
      <WorkspaceSidebar {...sidebar} />
      <ShellNavigator {...navigation} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader {...header} />
        <main id="app-main-content" className="flex-1 overflow-auto p-4 md:p-6">
          <div className="min-h-full rounded-[30px] border border-foreground/10 bg-background/82 shadow-[0_24px_80px_rgba(0,31,53,0.08)] backdrop-blur-xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
