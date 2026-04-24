import type { Workspace } from '@g4os/kernel/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  useTranslate,
} from '@g4os/ui';
import { useId, useState } from 'react';

export interface WorkspaceDeleteOptions {
  readonly removeFiles: boolean;
}

export interface WorkspaceDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly workspace: Workspace | null;
  readonly deleting?: boolean;
  readonly onConfirm: (options: WorkspaceDeleteOptions) => Promise<void>;
}

export function WorkspaceDeleteDialog({
  open,
  onOpenChange,
  workspace,
  deleting = false,
  onConfirm,
}: WorkspaceDeleteDialogProps) {
  const { t } = useTranslate();
  const confirmId = useId();
  const removeFilesId = useId();
  const [confirmationInput, setConfirmationInput] = useState('');
  const [removeFiles, setRemoveFiles] = useState(false);

  const canConfirm = workspace !== null && confirmationInput.trim() === workspace.name && !deleting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await onConfirm({ removeFiles });
    setConfirmationInput('');
    setRemoveFiles(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmationInput('');
          setRemoveFiles(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workspace.delete.title')}</DialogTitle>
          <DialogDescription>{t('workspace.delete.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={confirmId}>{t('workspace.delete.confirmLabel')}</Label>
            <Input
              id={confirmId}
              value={confirmationInput}
              placeholder={workspace?.name ?? ''}
              onChange={(event) => setConfirmationInput(event.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/10 px-4 py-3">
            <div className="flex-1">
              <Label htmlFor={removeFilesId} className="text-sm font-medium">
                {removeFiles ? t('workspace.delete.removeFiles') : t('workspace.delete.keepFiles')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {removeFiles
                  ? t('workspace.delete.removeFilesDescription')
                  : t('workspace.delete.keepFilesDescription')}
              </p>
            </div>
            <Switch id={removeFilesId} checked={removeFiles} onCheckedChange={setRemoveFiles} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
            {t('workspace.delete.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={!canConfirm}>
            {deleting ? t('workspace.delete.confirming') : t('workspace.delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
