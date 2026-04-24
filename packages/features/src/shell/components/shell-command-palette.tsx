import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  useTranslate,
} from '@g4os/ui';
import { formatShortcut, type ShellActionDefinition, shellActionDefinitions } from '../actions.ts';

export interface ShellCommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onNavigate: (to: string) => void;
  readonly onOpenShortcuts?: () => void;
  readonly onSignOut?: () => void;
}

export function ShellCommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onOpenShortcuts,
  onSignOut,
}: ShellCommandPaletteProps) {
  const { t } = useTranslate();

  const runAction = (action: ShellActionDefinition) => {
    onOpenChange(false);

    if (action.intent.kind === 'dialog' && action.intent.target === 'shortcuts') {
      onOpenShortcuts?.();
      return;
    }

    if (action.intent.kind === 'navigate') {
      onNavigate(action.intent.to);
      return;
    }

    if (action.intent.kind === 'session' && action.intent.target === 'sign-out') {
      onSignOut?.();
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('shell.command.inputPlaceholder')} />
      <CommandList>
        <CommandEmpty>{t('shell.command.empty')}</CommandEmpty>
        <CommandGroup heading={t('shell.command.section.navigation')}>
          {shellActionDefinitions
            .filter((action) => action.section === 'navigation')
            .map((action) => (
              <CommandItem
                key={action.id}
                value={t(action.labelKey)}
                onSelect={() => runAction(action)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t(action.labelKey)}</div>
                  <div className="text-xs text-muted-foreground">{t(action.descriptionKey)}</div>
                </div>
                <CommandShortcut>{formatShortcut(action.shortcut)}</CommandShortcut>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandGroup heading={t('shell.command.section.system')}>
          {shellActionDefinitions
            .filter(
              (action) =>
                action.section !== 'navigation' &&
                !(action.intent.kind === 'dialog' && action.intent.target === 'command-palette'),
            )
            .map((action) => (
              <CommandItem
                key={action.id}
                value={t(action.labelKey)}
                onSelect={() => runAction(action)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t(action.labelKey)}</div>
                  <div className="text-xs text-muted-foreground">{t(action.descriptionKey)}</div>
                </div>
                <CommandShortcut>{formatShortcut(action.shortcut)}</CommandShortcut>
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
