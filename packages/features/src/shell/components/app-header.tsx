import { Button, LanguageSwitcher, useTranslate } from '@g4os/ui';

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
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-foreground/10 bg-foreground-2 pl-4 pr-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</div>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="titlebar-no-drag flex items-center gap-2">
        {onOpenCommandPalette ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenCommandPalette}
            aria-label={t('shell.header.commandPalette')}
            title={t('shell.header.commandPalette')}
          >
            {t('shell.header.commandPalette')}
          </Button>
        ) : null}
        {onOpenShortcuts ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenShortcuts}
            aria-label={t('shell.header.shortcuts')}
            title={t('shell.header.shortcuts')}
          >
            {t('shell.header.shortcuts')}
          </Button>
        ) : null}

        <LanguageSwitcher variant="ghost" size="sm" />

        {userEmail ? (
          <span className="hidden max-w-[16rem] truncate rounded-full border border-foreground/10 px-3 py-1 text-xs text-muted-foreground sm:inline-block">
            {userEmail}
          </span>
        ) : null}
        {onSignOut ? (
          <Button variant="outline" size="sm" onClick={onSignOut}>
            {t('shell.header.signOut')}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
