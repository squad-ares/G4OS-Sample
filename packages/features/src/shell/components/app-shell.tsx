import { useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';
import { AppHeader, type AppHeaderProps } from './app-header.tsx';
import {
  ShellNavigator,
  type ShellNavigatorProps,
  type ShellNavigatorWorkspace,
} from './shell-navigator.tsx';
import { WorkspaceSidebar } from './workspace-sidebar.tsx';

export interface AppShellProps {
  readonly header: AppHeaderProps;
  readonly navigation: Pick<ShellNavigatorProps, 'activePath' | 'onNavigate'>;
  readonly workspace?: ShellNavigatorWorkspace;
  readonly onOpenSupport?: () => void;
  readonly children: ReactNode;
}

export function AppShell({
  header,
  navigation,
  workspace,
  onOpenSupport,
  children,
}: AppShellProps) {
  const { t } = useTranslate();

  return (
    <div className="relative flex h-dvh min-h-0 overflow-hidden bg-foreground-2 text-foreground">
      <div className="titlebar-drag-region pointer-events-none fixed inset-x-0 top-0 z-10 h-[38px]" />

      <a
        href="#app-main-content"
        className="sr-only rounded-full bg-foreground px-4 py-2 text-background focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-80"
      >
        {t('shell.a11y.skipToContent')}
      </a>

      <WorkspaceSidebar
        activePath={navigation.activePath}
        onNavigate={navigation.onNavigate}
        {...(onOpenSupport ? { onOpenSupport } : {})}
      />
      <ShellNavigator
        activePath={navigation.activePath}
        onNavigate={navigation.onNavigate}
        {...(workspace ? { workspace } : {})}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader {...header} />
        <main
          id="app-main-content"
          className="min-h-0 flex-1 overflow-auto bg-background px-6 py-5 md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
