import type { ProjectCreateInput } from '@g4os/kernel/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InputField,
  Label,
  useTranslate,
} from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export interface CreateProjectDialogProps {
  readonly workspaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: ProjectCreateInput) => Promise<void>;
}

const PRESET_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7'];

const projectFormSchema = z.object({
  name: z.string().trim().min(1, { message: 'required' }),
  description: z.string(),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

export function CreateProjectDialog({
  workspaceId,
  open,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const { t } = useTranslate();
  const [color, setColor] = useState(PRESET_COLORS[0] ?? '#6366f1');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: '', description: '' },
    mode: 'onChange',
  });

  function reset() {
    form.reset({ name: '', description: '' });
    setColor(PRESET_COLORS[0] ?? '#6366f1');
    setSubmitError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit({
        workspaceId,
        name: values.name.trim(),
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
        color,
      });
      handleOpenChange(false);
    } catch {
      setSubmitError(t('project.dialog.errorGeneric'));
    }
  });

  const { isSubmitting, isValid } = form.formState;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('project.dialog.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <InputField
            control={form.control}
            name="name"
            label={t('project.dialog.name.label')}
            placeholder={t('project.dialog.name.placeholder')}
            required={true}
          />

          <InputField
            control={form.control}
            name="description"
            label={t('project.dialog.description.label')}
            placeholder={t('project.dialog.description.placeholder')}
          />

          <div className="flex flex-col gap-1.5">
            <Label>{t('project.dialog.color.label')}</Label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'white' : 'transparent',
                    outline: color === c ? `2px solid ${c}` : 'none',
                  }}
                  onClick={() => setColor(c)}
                  aria-label={`${t('project.dialog.color.label')} ${c}`}
                />
              ))}
            </div>
          </div>

          {submitError && <p className="text-xs text-destructive">{submitError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('project.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !isValid}>
              {isSubmitting ? t('project.dialog.creating') : t('project.dialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
