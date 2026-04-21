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
      className="hidden w-70 shrink-0 border-r border-foreground/10 bg-background/60 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col"
    >
      <div className="mb-5 rounded-3xl border border-foreground/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.72),rgba(255,255,255,0.34))] p-4 shadow-[0_18px_48px_rgba(0,31,53,0.08)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
          {t('shell.nav.matrixBadge')}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t('shell.nav.matrixDescription')}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-auto pr-1">
        {sectionOrder.map((section) => {
          const entries = shellNavigationEntries.filter((entry) => entry.section === section);

          return (
            <section key={section} className="space-y-2">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t(sectionTitleKey(section))}
              </div>
              <div className="space-y-1">
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
    ? 'border-foreground/12 bg-foreground text-background shadow-[0_18px_34px_rgba(0,31,53,0.24)]'
    : 'border-foreground/10 bg-background/82 hover:-translate-y-0.5 hover:border-accent/55 hover:bg-accent/6';
  const descriptionClass = active ? 'text-background/78' : 'text-muted-foreground';
  const badgeClass =
    entry.status === 'ready'
      ? active
        ? 'bg-background/16 text-background'
        : 'bg-foreground/6 text-foreground/78'
      : active
        ? 'bg-background/16 text-background'
        : 'bg-accent/14 text-accent';

  return (
    <button
      type="button"
      onClick={() => onNavigate(entry.to)}
      aria-current={active ? 'page' : undefined}
      className={`w-full rounded-[22px] border px-4 py-3 text-left transition-all ${containerClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-[-0.02em]">{t(entry.labelKey)}</div>
          <p className={`mt-1 text-xs leading-5 ${descriptionClass}`}>{t(entry.descriptionKey)}</p>
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeClass}`}
        >
          {t(entry.status === 'ready' ? 'shell.nav.status.ready' : 'shell.nav.status.planned')}
        </span>
      </div>
    </button>
  );
}
