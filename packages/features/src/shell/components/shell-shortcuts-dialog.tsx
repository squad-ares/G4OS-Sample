import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useTranslate,
} from '@g4os/ui';
import { formatShortcut, shellActionDefinitions } from '../actions.ts';

export interface ShellShortcutsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function ShellShortcutsDialog({ open, onOpenChange }: ShellShortcutsDialogProps) {
  const { t } = useTranslate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('shell.shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shell.shortcuts.description')}</DialogDescription>
        </DialogHeader>

        <ul className="grid gap-3" aria-label={t('shell.shortcuts.listAriaLabel')}>
          {shellActionDefinitions.map((action) => (
            <li
              key={action.id}
              className="flex items-center justify-between gap-4 rounded-[22px] border border-foreground/10 bg-background/82 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                  {t(action.labelKey)}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t(action.descriptionKey)}
                </div>
              </div>
              <kbd className="rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-foreground/78">
                {formatShortcut(action.shortcut)}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
