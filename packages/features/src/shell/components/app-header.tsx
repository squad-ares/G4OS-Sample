import { Button, useTranslate } from '@g4os/ui';

export interface AppHeaderProps {
  readonly title: string;
  readonly description: string;
  readonly userEmail?: string;
  readonly onSignOut?: () => void;
  readonly onOpenCommandPalette?: () => void;
  readonly onOpenShortcuts?: () => void;
}

export function AppHeader({
  title,
  description,
  userEmail,
  onSignOut,
  onOpenCommandPalette,
  onOpenShortcuts,
}: AppHeaderProps) {
  const { t } = useTranslate();
  return (
    <header className="border-b border-foreground/10 bg-background/76 px-6 py-4 backdrop-blur-xl">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            {t('shell.header.productBadge')}
          </div>
          <div className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{title}</div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {onOpenCommandPalette ? (
            <Button variant="outline" size="sm" onClick={onOpenCommandPalette}>
              {t('shell.header.commandPalette')}
            </Button>
          ) : null}
          {onOpenShortcuts ? (
            <Button variant="outline" size="sm" onClick={onOpenShortcuts}>
              {t('shell.header.shortcuts')}
            </Button>
          ) : null}
          {userEmail ? (
            <span className="hidden rounded-full border border-foreground/10 bg-background/80 px-3 py-1.5 sm:inline-flex">
              {userEmail}
            </span>
          ) : null}
          {onSignOut ? (
            <Button variant="outline" size="sm" onClick={onSignOut}>
              {t('shell.header.signOut')}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
