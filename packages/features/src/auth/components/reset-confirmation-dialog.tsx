import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useTranslate,
} from '@g4os/ui';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

interface ResetConfirmationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void | Promise<void>;
  readonly isResetting?: boolean;
}

/**
 * Dialog destrutivo de reset. Para evitar que o usuário clique sem ler, exige
 * resolver um problema de matemática aleatório (paridade V1). Lista o que
 * será apagado e mostra warning de irreversibilidade.
 */
export function ResetConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  isResetting = false,
}: ResetConfirmationDialogProps) {
  const { t } = useTranslate();
  const inputId = useId();
  const [answer, setAnswer] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: `open` é gatilho intencional — regenera o desafio toda vez que o dialog abre/fecha
  const problem = useMemo(() => {
    // non-crypto: anti-accident UX gate (CAPTCHA humano), não segurança
    const a = Math.floor(Math.random() * 50) + 10;
    const b = Math.floor(Math.random() * 50) + 10;
    return { a, b, sum: a + b };
  }, [open]);

  useEffect(() => {
    if (!open) setAnswer('');
  }, [open]);

  const isCorrect = Number.parseInt(answer, 10) === problem.sum;

  const handleConfirm = () => {
    if (!isCorrect || isResetting) return;
    void onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isResetting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            {t('auth.reset.dialog.title')}
          </DialogTitle>
          <DialogDescription className="pt-2 text-left">
            {t('auth.reset.dialog.warning')}
          </DialogDescription>
        </DialogHeader>

        <ul className="list-inside list-disc space-y-1 pl-2 text-sm text-muted-foreground">
          <li>{t('auth.reset.dialog.itemWorkspaces')}</li>
          <li>{t('auth.reset.dialog.itemCredentials')}</li>
          <li>{t('auth.reset.dialog.itemPreferences')}</li>
        </ul>

        <div className="rounded-md border border-info/30 bg-info/10 p-3 text-sm">
          <strong className="text-foreground">{t('auth.reset.dialog.backupHint')}</strong>
          <p className="mt-1 text-muted-foreground">{t('auth.reset.dialog.irreversible')}</p>
        </div>

        <div className="space-y-2 pt-2">
          <label htmlFor={inputId} className="text-sm font-medium">
            {t('auth.reset.dialog.challengePrompt', { a: problem.a, b: problem.b })}
          </label>
          <Input
            id={inputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={t('auth.reset.dialog.challengePlaceholder')}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isCorrect) handleConfirm();
            }}
            disabled={isResetting}
            className="max-w-32"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isResetting}
          >
            {t('auth.reset.dialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!isCorrect || isResetting}
            onClick={handleConfirm}
          >
            {t('auth.reset.dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
