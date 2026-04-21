import { Spinner, useTranslate } from '@g4os/ui';
import type { ReactNode } from 'react';
import { formatShortcut, shellActionDefinitions } from '../actions.ts';
import { getShellNavigationEntry, type ShellNavigationId } from '../navigation.ts';

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
    <section className="min-h-full p-6 md:p-8">
      <div className="space-y-6">
        <div className="rounded-[28px] border border-foreground/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.72),rgba(255,255,255,0.34))] p-6 shadow-[0_18px_48px_rgba(0,31,53,0.08)]">
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

export interface ShellStatusPanelProps {
  readonly title: string;
  readonly description: string;
  readonly tone?: 'default' | 'warning' | 'danger';
  readonly badge?: string;
  readonly role?: 'status' | 'alert';
  readonly children?: ReactNode;
}

export function ShellStatusPanel({
  title,
  description,
  tone = 'default',
  badge,
  role = 'status',
  children,
}: ShellStatusPanelProps) {
  const toneClass =
    tone === 'warning'
      ? 'border-accent/30 bg-accent/8'
      : tone === 'danger'
        ? 'border-destructive/30 bg-destructive/8'
        : 'border-foreground/10 bg-background/82';

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      className={`rounded-[24px] border p-5 shadow-[0_14px_34px_rgba(0,31,53,0.06)] ${toneClass}`}
    >
      {badge ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          {badge}
        </div>
      ) : null}
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export function ShellLoadingState() {
  const { t } = useTranslate();

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen w-full items-center justify-center bg-foreground-2 text-foreground"
    >
      <div className="titlebar-drag-region fixed inset-x-0 top-0 z-10 h-[50px]" />
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
