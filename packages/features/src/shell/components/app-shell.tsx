import { useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';
import {
  ContextualSubSidebar,
  type ContextualSubSidebarProps,
} from './sub-sidebar/contextual-sub-sidebar.tsx';
import type { SubSidebarWorkspace } from './sub-sidebar/sub-sidebar-footer.tsx';
import { WorkspaceSidebar } from './workspace-sidebar.tsx';

export interface AppShellProps {
  readonly navigation: {
    readonly activePath: string;
    readonly onNavigate: (to: string) => void;
  };
  readonly workspace?: SubSidebarWorkspace;
  readonly onOpenSupport?: () => void;
  readonly onOpenCommandPalette?: () => void;
  readonly onOpenShortcuts?: () => void;
  readonly onSignOut?: () => void;
  readonly renderSubSidebarPanel?: ContextualSubSidebarProps['renderPanel'];
  readonly children: ReactNode;
}

const CHAT_SESSION_PATTERN = /\/workspaces\/[^/]+\/sessions\/[^/]+/;

function isChatRoute(pathname: string): boolean {
  return CHAT_SESSION_PATTERN.test(pathname);
}

export function AppShell({
  navigation,
  workspace,
  onOpenSupport,
  onOpenCommandPalette,
  onOpenShortcuts,
  onSignOut,
  renderSubSidebarPanel,
  children,
}: AppShellProps) {
  const { t } = useTranslate();
  const chatMode = isChatRoute(navigation.activePath);

  return (
    <div className="chat-dotted-bg relative flex h-dvh min-h-0 overflow-hidden text-foreground">
      <div className="titlebar-drag-region pointer-events-none fixed inset-x-0 top-0 z-10 h-10" />

      <a
        href="#app-main-content"
        className="sr-only rounded-full bg-foreground px-4 py-2 text-background focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-80"
      >
        {t('shell.a11y.skipToContent')}
      </a>

      <WorkspaceSidebar activePath={navigation.activePath} onNavigate={navigation.onNavigate} />

      <div className="flex min-h-0 flex-1 gap-3 py-3 pr-3">
        <ContextualSubSidebar
          activePath={navigation.activePath}
          {...(workspace ? { workspace } : {})}
          {...(onOpenSupport ? { onOpenSupport } : {})}
          {...(onOpenCommandPalette ? { onOpenCommandPalette } : {})}
          {...(onOpenShortcuts ? { onOpenShortcuts } : {})}
          {...(onSignOut ? { onSignOut } : {})}
          {...(renderSubSidebarPanel ? { renderPanel: renderSubSidebarPanel } : {})}
        />

        <main
          id="app-main-content"
          className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] ${
            chatMode ? 'bg-transparent' : 'bg-background shadow-middle'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
