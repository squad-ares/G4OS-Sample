import { Spinner, StatusPanel, type StatusPanelProps, useTranslate } from '@g4os/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { formatShortcut, shellActionDefinitions } from '../actions.ts';
import { getShellNavigationEntry, type ShellNavigationId } from '../navigation.ts';

/**
 * Alias retrocompatível para `StatusPanel` movido para `@g4os/ui` em CR5-04.
 * Consumers internos de shell continuam usando este nome; cross-feature
 * (settings/etc.) deve importar `StatusPanel` direto de `@g4os/ui`.
 *
 * @deprecated Use `StatusPanel` de `@g4os/ui`.
 */
export type ShellStatusPanelProps = StatusPanelProps;
export const ShellStatusPanel = StatusPanel;

export interface ShellPageScaffoldProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

export function ShellPageScaffold({
  eyebrow,
  title,
  description,
  children,
}: ShellPageScaffoldProps) {
  return (
    <section className="h-full overflow-y-auto p-6 md:p-8">
      <div className="space-y-6 pb-6">
        <div className="rounded-[28px] border border-foreground/10 p-6 shadow-[0_18px_48px_rgba(0,31,53,0.08)]">
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

// Após `STUCK_THRESHOLD_MS` mostramos botão de recovery. Boot real é
// tipicamente <500ms; se ultrapassar 5s, algo está pendurado e o usuário
// precisa de uma saída visível — sem isso o app fica refém da pending
// state e parece travado.
const STUCK_THRESHOLD_MS = 5_000;

export function ShellLoadingState() {
  const { t } = useTranslate();
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setShowRecovery(true), STUCK_THRESHOLD_MS);
    return () => clearTimeout(handle);
  }, []);

  const handleReload = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen w-full items-center justify-center bg-foreground-2 text-foreground"
    >
      <div className="titlebar-drag-region pointer-events-none fixed inset-x-0 top-0 z-10 h-10" />
      <div className="flex w-[26rem] max-w-full flex-col items-center gap-5 px-8 py-10 text-center">
        <div className="flex items-center justify-center rounded-full border border-foreground/10 bg-background/82 p-4 shadow-[0_14px_34px_rgba(0,31,53,0.08)]">
          <span className="block text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            {t('app.name')}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <span>{t('shell.state.loading.progress')}</span>
        </div>
        {showRecovery ? (
          <button
            type="button"
            onClick={handleReload}
            className="mt-2 rounded-md border border-foreground/15 bg-background px-4 py-2 text-xs font-medium hover:bg-accent/12"
          >
            {t('shell.state.loading.stuck')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ShellErrorState() {
  const { t } = useTranslate();

  return (
    <ShellStatusPanel
      title={t('shell.state.error.title')}
      description={t('shell.state.error.description')}
      tone="danger"
      role="alert"
      badge={t('shell.state.error.badge')}
    />
  );
}

export function ShellPlaceholderPage({ pageId }: { readonly pageId: ShellNavigationId }) {
  const { t } = useTranslate();
  const entry = getShellNavigationEntry(pageId);

  return (
    <ShellPageScaffold
      eyebrow={t('shell.placeholder.badge')}
      title={t(entry.labelKey)}
      description={t(entry.descriptionKey)}
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <ShellStatusPanel
          title={t('shell.placeholder.title')}
          description={t('shell.placeholder.description')}
          badge={t('shell.placeholder.contractBadge')}
        />
        <ShellStatusPanel
          title={t('shell.placeholder.shortcutTitle')}
          description={t('shell.placeholder.shortcutDescription')}
          tone="warning"
        >
          <ShortcutsList />
        </ShellStatusPanel>
      </div>
    </ShellPageScaffold>
  );
}

export function ShortcutsList() {
  const { t } = useTranslate();

  return (
    <ul className="grid gap-2" aria-label={t('shell.shortcuts.listAriaLabel')}>
      {shellActionDefinitions.map((action) => (
        <li key={action.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{t(action.labelKey)}</div>
            <div className="text-xs leading-5 text-muted-foreground">
              {t(action.descriptionKey)}
            </div>
          </div>
          <kbd className="rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-foreground/78">
            {formatShortcut(action.shortcut)}
          </kbd>
        </li>
      ))}
    </ul>
  );
}
