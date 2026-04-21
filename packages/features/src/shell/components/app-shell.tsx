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
    <div className="relative flex min-h-dvh overflow-hidden bg-foreground-2 text-foreground">
      <div className="titlebar-drag-region pointer-events-none fixed inset-x-0 top-0 z-10 h-[38px]" />

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
        <main
          id="app-main-content"
          className="flex-1 overflow-auto bg-background px-6 py-5 md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
