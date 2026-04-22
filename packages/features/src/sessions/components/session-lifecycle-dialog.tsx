/**
 * Dialog de confirmação para archive/delete/restore. Um componente,
 * 3 modes — o caller passa o `kind` e manipuladores; o texto vem do
 * dicionário via `session.dialog.<kind>.*`.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useTranslate,
} from '@g4os/ui';

export type SessionLifecycleDialogKind = 'archive' | 'delete' | 'restore';

export interface SessionLifecycleDialogProps {
  readonly open: boolean;
  readonly kind: SessionLifecycleDialogKind;
  readonly sessionName: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly isPending?: boolean;
}

export function SessionLifecycleDialog({
  open,
  kind,
  sessionName,
  onConfirm,
  onCancel,
  isPending,
}: SessionLifecycleDialogProps) {
  const { t } = useTranslate();
  const { titleKey, descriptionKey, confirmKey, destructive } = keysForKind(kind);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>
            {t(descriptionKey)}
            <br />
            <span className="mt-2 block text-foreground/70">“{sessionName}”</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            {t('session.dialog.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isPending}
          >
            {t(confirmKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DialogCopyKey =
  | 'session.dialog.archive.title'
  | 'session.dialog.archive.description'
  | 'session.dialog.archive.confirm'
  | 'session.dialog.delete.title'
  | 'session.dialog.delete.description'
  | 'session.dialog.delete.confirm'
  | 'session.dialog.restore.title'
  | 'session.dialog.restore.description'
  | 'session.dialog.restore.confirm';

function keysForKind(kind: SessionLifecycleDialogKind): {
  readonly titleKey: DialogCopyKey;
  readonly descriptionKey: DialogCopyKey;
  readonly confirmKey: DialogCopyKey;
  readonly destructive: boolean;
} {
  if (kind === 'archive') {
    return {
      titleKey: 'session.dialog.archive.title',
      descriptionKey: 'session.dialog.archive.description',
      confirmKey: 'session.dialog.archive.confirm',
      destructive: false,
    };
  }
  if (kind === 'delete') {
    return {
      titleKey: 'session.dialog.delete.title',
      descriptionKey: 'session.dialog.delete.description',
      confirmKey: 'session.dialog.delete.confirm',
      destructive: true,
    };
  }
  return {
    titleKey: 'session.dialog.restore.title',
    descriptionKey: 'session.dialog.restore.description',
    confirmKey: 'session.dialog.restore.confirm',
    destructive: false,
  };
}
