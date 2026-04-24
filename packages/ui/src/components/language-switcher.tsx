import { type AppLocale, supportedLocales } from '@g4os/translate';
import { Check, Languages } from 'lucide-react';
import { cn } from '../libs/utils.ts';
import { useTranslate } from '../translate/translate-provider.tsx';
import { Button, type ButtonProps } from './button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu.tsx';

type ButtonVariant = NonNullable<ButtonProps['variant']>;
type ButtonSize = NonNullable<ButtonProps['size']>;

export interface LanguageSwitcherProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
  /** Exibir apenas o ícone do globo, sem texto do locale atual. */
  readonly compact?: boolean;
}

const localeKey: Record<AppLocale, 'locale.pt-BR' | 'locale.en-US'> = {
  'pt-BR': 'locale.pt-BR',
  'en-US': 'locale.en-US',
};

const localeShort: Record<AppLocale, string> = {
  'pt-BR': 'PT',
  'en-US': 'EN',
};

export function LanguageSwitcher({
  variant = 'outline',
  size = 'sm',
  className,
  compact,
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={true}>
        <Button
          type="button"
          variant={variant}
          size={size}
          aria-label={t('shell.language.switcherLabel')}
          title={t('shell.language.switcherHint')}
          className={cn('gap-2', className)}
        >
          <Languages className="size-4" aria-hidden="true" />
          {compact ? null : (
            <span className="text-xs font-semibold uppercase tracking-wider">
              {localeShort[locale]}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{t('shell.language.switcherLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {supportedLocales.map((entry) => {
          const isActive = entry === locale;
          return (
            <DropdownMenuItem
              key={entry}
              onSelect={() => setLocale(entry)}
              className="flex items-center justify-between gap-3"
            >
              <span>{t(localeKey[entry])}</span>
              {isActive ? (
                <Check className="size-4 text-accent" aria-hidden="true" />
              ) : (
                <span aria-hidden="true" className="size-4" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
