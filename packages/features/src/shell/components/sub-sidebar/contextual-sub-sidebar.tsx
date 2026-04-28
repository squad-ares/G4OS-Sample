import type { TranslationKey } from '@g4os/translate';
import { resolveShellNavigation, type ShellNavigationId } from '../../navigation.ts';
import { PlaceholderPanel } from './placeholder-panel.tsx';
import { SubSidebarFooter, type SubSidebarWorkspace } from './sub-sidebar-footer.tsx';

export interface ContextualSubSidebarProps {
  readonly activePath: string;
  readonly workspace?: SubSidebarWorkspace | undefined;
  readonly onOpenSupport?: () => void;
  readonly onOpenCommandPalette?: () => void;
  readonly onOpenShortcuts?: () => void;
  readonly onSignOut?: () => void;
  /** Optional per-feature panel overrides. If not provided for a ready feature, a placeholder is rendered. */
  readonly renderPanel?: (args: {
    readonly featureId: ShellNavigationId;
    readonly footer: React.ReactNode;
  }) => React.ReactNode;
}

const PLACEHOLDER_TITLE: Record<ShellNavigationId, TranslationKey> = {
  sessions: 'shell.subsidebar.title.sessions',
  projects: 'shell.subsidebar.title.projects',
  connections: 'shell.subsidebar.title.connections',
  automations: 'shell.subsidebar.title.automations',
  marketplace: 'shell.subsidebar.title.marketplace',
  news: 'shell.subsidebar.title.news',
  settings: 'shell.subsidebar.title.settings',
};

export function ContextualSubSidebar({
  activePath,
  workspace,
  onOpenSupport,
  onOpenCommandPalette,
  onOpenShortcuts,
  onSignOut,
  renderPanel,
}: ContextualSubSidebarProps) {
  const entry = resolveShellNavigation(activePath);
  const featureId = (entry?.id ?? 'sessions') as ShellNavigationId;

  const footer = (
    <SubSidebarFooter
      {...(workspace ? { workspace } : {})}
      {...(onOpenSupport ? { onOpenSupport } : {})}
      {...(onOpenCommandPalette ? { onOpenCommandPalette } : {})}
      {...(onOpenShortcuts ? { onOpenShortcuts } : {})}
      {...(onSignOut ? { onSignOut } : {})}
    />
  );

  const custom = renderPanel?.({ featureId, footer });
  if (custom !== undefined) return <>{custom}</>;

  return <PlaceholderPanel titleKey={PLACEHOLDER_TITLE[featureId]} footer={footer} />;
}
