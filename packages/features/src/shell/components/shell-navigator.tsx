import type { TranslationKey } from '@g4os/translate';
import { useTranslate } from '@g4os/ui';
import { type ShellNavigationSection, shellNavigationEntries } from '../navigation.ts';

const sectionOrder: readonly ShellNavigationSection[] = ['workspace', 'automation', 'system'];

export interface ShellNavigatorProps {
  readonly activePath: string;
  readonly onNavigate: (to: string) => void;
}

export function ShellNavigator({ activePath, onNavigate }: ShellNavigatorProps) {
  const { t } = useTranslate();

  return (
    <nav
      aria-label={t('shell.nav.ariaLabel')}
      className="hidden w-60 shrink-0 flex-col border-r border-foreground/10 bg-foreground-2 px-3 pb-4 pt-12 lg:flex"
    >
      <div className="flex flex-1 flex-col gap-4 overflow-auto pr-1">
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

  const containerClass = active
    ? 'bg-foreground/8 text-foreground'
    : 'text-foreground/75 hover:bg-foreground/5 hover:text-foreground';

  return (
    <button
      type="button"
      onClick={() => onNavigate(entry.to)}
      aria-current={active ? 'page' : undefined}
      className={`titlebar-no-drag flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-sm font-medium transition-colors ${containerClass}`}
    >
      <span className="truncate">{t(entry.labelKey)}</span>
      {entry.status === 'planned' ? (
        <span className="shrink-0 rounded-full bg-accent/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
          {t('shell.nav.status.planned')}
        </span>
      ) : null}
    </button>
  );
}
