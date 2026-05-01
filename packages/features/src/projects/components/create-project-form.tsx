import type { ProjectCreateInput } from '@g4os/kernel/types';
import { Button, InputField, Label, useTranslate } from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export interface CreateProjectFormProps {
  readonly workspaceId: string;
  readonly onSubmit: (input: ProjectCreateInput) => Promise<void>;
  readonly onCancel?: () => void;
  /** Texto do botão de submit (default: `t('project.dialog.create')`). */
  readonly submitLabel?: string;
}

const PRESET_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7'];

const projectFormSchema = z.object({
  name: z.string().trim().min(1, { message: 'required' }),
  description: z.string(),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

/**
 * Form puro de criação de projeto — extraído de `CreateProjectDialog` para
 * ser reusável tanto no modal (legacy) quanto na page nova
 * (`/projects/new` com fullscreen overlay, ADR-0150 + ADR-0157).
 *
 * Não monta `Dialog` por fora — o caller decide o container. Submit, reset
 * e color picker continuam aqui.
 */
export function CreateProjectForm({
  workspaceId,
  onSubmit,
  onCancel,
  submitLabel,
}: CreateProjectFormProps) {
  const { t } = useTranslate();
  const [color, setColor] = useState(PRESET_COLORS[0] ?? '#6366f1');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: '', description: '' },
    mode: 'onChange',
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit({
        workspaceId,
        name: values.name.trim(),
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
        color,
      });
    } catch {
      setSubmitError(t('project.dialog.errorGeneric'));
    }
  });

  const { isSubmitting, isValid } = form.formState;

  return (
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
              className="h-6 w-6 cursor-pointer rounded-full border-2 opacity-90 transition-opacity hover:opacity-100"
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

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {t('project.dialog.cancel')}
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting || !isValid}>
          {isSubmitting
            ? t('project.dialog.creating')
            : (submitLabel ?? t('project.dialog.create'))}
        </Button>
      </div>
    </form>
  );
}
