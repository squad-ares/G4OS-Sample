import type { ProjectCreateInput } from '@g4os/kernel/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, useTranslate } from '@g4os/ui';
import { CreateProjectForm } from './create-project-form.tsx';

export interface CreateProjectDialogProps {
  readonly workspaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: ProjectCreateInput) => Promise<void>;
}

/**
 * Versão modal do form de criação de projeto. Para o caminho canônico
 * (`/projects/new` com fullscreen overlay, ADR-0150 + ADR-0157), use
 * `CreateProjectForm` direto. Este wrapper segue exposto para casos
 * pontuais que precisam de criação inline sem mudar de rota.
 */
export function CreateProjectDialog({
  workspaceId,
  open,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const { t } = useTranslate();

  const handleSubmit = async (input: ProjectCreateInput) => {
    await onSubmit(input);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('project.dialog.title')}</DialogTitle>
        </DialogHeader>
        <CreateProjectForm
          workspaceId={workspaceId}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
