import type { TranslationKey } from '@g4os/translate';
import { useTranslate } from '@g4os/ui';
import { ChevronDown } from 'lucide-react';
import { type ShellNavigationSection, shellNavigationEntries } from '../navigation.ts';

const sectionOrder: readonly ShellNavigationSection[] = ['workspace', 'automation', 'system'];

export interface ShellNavigatorWorkspace {
  readonly name: string;
  readonly onOpenSwitcher?: () => void;
}

export interface ShellNavigatorProps {
  readonly activePath: string;
  readonly onNavigate: (to: string) => void;
  readonly workspace?: ShellNavigatorWorkspace;
}

export function ShellNavigator({ activePath, onNavigate, workspace }: ShellNavigatorProps) {
  const { t } = useTranslate();

  return (
    <nav
      aria-label={t('shell.nav.ariaLabel')}
      className="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-r border-foreground/10 bg-foreground-2 pb-2 pt-12 lg:flex"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-3 pr-1">
        {sectionOrder.map((section) => {
          const entries = shellNavigationEntries.filter((entry) => entry.section === section);

          return (
            <section key={section} className="space-y-1">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t(sectionTitleKey(section))}
              </div>
              <div className="space-y-0.5">
                {entries.map((entry) => (
                  <ShellNavigatorEntryButton
                    key={entry.id}
                    entry={entry}
                    active={activePath === entry.to || activePath.startsWith(`${entry.to}/`)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {workspace ? <WorkspaceFooter workspace={workspace} /> : null}
    </nav>
  );
}

function sectionTitleKey(section: ShellNavigationSection): TranslationKey {
  if (section === 'workspace') return 'shell.nav.section.workspace';
  if (section === 'automation') return 'shell.nav.section.automation';
  return 'shell.nav.section.system';
}

function ShellNavigatorEntryButton({
  entry,
  active,
  onNavigate,
}: {
  readonly entry: (typeof shellNavigationEntries)[number];
  readonly active: boolean;
  readonly onNavigate: (to: string) => void;
}) {
  const { t } = useTranslate();
  const Icon = entry.icon;

  const containerClass = active
    ? 'bg-foreground/8 text-foreground'
    : 'text-foreground/75 hover:bg-foreground/5 hover:text-foreground';

  return (
    <button
      type="button"
      onClick={() => onNavigate(entry.to)}
      aria-current={active ? 'page' : undefined}
      className={`titlebar-no-drag flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-sm font-medium transition-colors ${containerClass}`}
    >
      <Icon className="size-4 shrink-0 opacity-80" aria-hidden={true} />
      <span className="flex-1 truncate">{t(entry.labelKey)}</span>
      {entry.status === 'planned' ? (
        <span className="shrink-0 rounded-full bg-accent/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
          {t('shell.nav.status.planned')}
        </span>
      ) : null}
    </button>
  );
}

function WorkspaceFooter({ workspace }: { readonly workspace: ShellNavigatorWorkspace }) {
  const { t } = useTranslate();
  const initial = workspace.name.trim().charAt(0).toUpperCase() || '?';
  const label = t('shell.nav.workspace.switcher');

  const content = (
    <>
      <span
        aria-hidden={true}
        className="flex size-6 items-center justify-center rounded-md bg-foreground text-[10px] font-semibold text-background"
      >
        {initial}
      </span>
      <span className="flex-1 truncate text-left">{workspace.name}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
    </>
  );

  return (
    <div className="mt-2 border-t border-foreground/8 px-3 pt-2">
      {workspace.onOpenSwitcher ? (
        <button
          type="button"
          onClick={workspace.onOpenSwitcher}
          aria-label={label}
          title={label}
          className="titlebar-no-drag flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-foreground/6 hover:text-foreground"
        >
          {content}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-xs font-medium text-foreground/85">
          {content}
        </div>
      )}
    </div>
  );
}
