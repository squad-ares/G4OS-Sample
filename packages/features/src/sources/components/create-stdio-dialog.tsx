import type { CreateMcpStdioSourceInput } from '@g4os/kernel/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InputField,
  TextareaField,
  useTranslate,
} from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export interface CreateStdioDialogProps {
  readonly workspaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: CreateMcpStdioSourceInput) => Promise<void>;
}

const stdioFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/, { message: 'slug_invalid' }),
  displayName: z.string().trim().min(1).max(200),
  command: z.string().trim().min(1),
  argsText: z.string(),
  envText: z.string(),
  description: z.string().trim().max(500).optional(),
});
type StdioFormValues = z.infer<typeof stdioFormSchema>;

export function CreateStdioDialog({
  workspaceId,
  open,
  onOpenChange,
  onSubmit,
}: CreateStdioDialogProps) {
  const { t } = useTranslate();
  const form = useForm<StdioFormValues>({
    resolver: zodResolver(stdioFormSchema),
    defaultValues: { slug: '', displayName: '', command: '', argsText: '', envText: '' },
    mode: 'onChange',
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    const args = values.argsText
      .split('\n')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    const env = parseEnvBlock(values.envText);
    const input: CreateMcpStdioSourceInput = {
      workspaceId,
      slug: values.slug,
      displayName: values.displayName,
      command: values.command,
      args,
      env,
      ...(values.description && values.description.trim().length > 0
        ? { description: values.description.trim() }
        : {}),
    };
    await onSubmit(input);
    form.reset();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('sources.dialog.stdio.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <InputField
            control={form.control}
            name="slug"
            label={t('sources.dialog.slug.label')}
            description={t('sources.dialog.slug.description')}
            placeholder={t('sources.dialog.slug.placeholder')}
            required={true}
          />
          <InputField
            control={form.control}
            name="displayName"
            label={t('sources.dialog.displayName.label')}
            placeholder={t('sources.dialog.displayName.placeholder')}
            required={true}
          />
          <InputField
            control={form.control}
            name="command"
            label={t('sources.dialog.stdio.command.label')}
            description={t('sources.dialog.stdio.command.description')}
            placeholder={t('sources.dialog.stdio.command.placeholder')}
            required={true}
          />
          <TextareaField
            control={form.control}
            name="argsText"
            label={t('sources.dialog.stdio.args.label')}
            description={t('sources.dialog.stdio.args.description')}
            placeholder={t('sources.dialog.stdio.args.placeholder')}
            minRows={3}
          />
          <TextareaField
            control={form.control}
            name="envText"
            label={t('sources.dialog.stdio.env.label')}
            description={t('sources.dialog.stdio.env.description')}
            placeholder={t('sources.dialog.stdio.env.placeholder')}
            minRows={3}
          />
          <InputField
            control={form.control}
            name="description"
            label={t('sources.dialog.description.label')}
            placeholder={t('sources.dialog.description.placeholder')}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('sources.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
              {t('sources.dialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function parseEnvBlock(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key.length > 0) out[key] = value;
  }
  return out;
}
