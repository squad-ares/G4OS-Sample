import type { Workspace } from '@g4os/kernel/types';
import {
  Button,
  InputField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useTranslate,
} from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ShellStatusPanel } from '../../shell/index.ts';

export interface WorkspaceCategoryProps {
  readonly workspaces: readonly Workspace[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onSave: (input: WorkspaceCategoryFormInput) => Promise<void>;
  readonly isSaving?: boolean;
}

export interface WorkspaceCategoryFormInput {
  readonly id: string;
  readonly name: string;
  readonly workingDirectory: string;
  readonly projectsRootPath: string;
  readonly llmConnectionSlug: string;
}

const workspaceFormSchema = z.object({
  name: z.string().trim().min(2, { message: 'min 2' }),
  workingDirectory: z.string(),
  projectsRootPath: z.string(),
  llmConnectionSlug: z.string(),
});

type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;

function extractDefaults(workspace: Workspace | null): WorkspaceFormValues {
  return {
    name: workspace?.name ?? '',
    workingDirectory: workspace?.defaults?.workingDirectory ?? '',
    projectsRootPath: workspace?.defaults?.projectsRootPath ?? '',
    llmConnectionSlug: workspace?.defaults?.llmConnectionSlug ?? '',
  };
}

export function WorkspaceCategory({
  workspaces,
  selectedId,
  onSelect,
  onSave,
  isSaving,
}: WorkspaceCategoryProps) {
  const { t } = useTranslate();
  const active = workspaces.find((w) => w.id === selectedId) ?? null;

  const form = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: extractDefaults(active),
    mode: 'onChange',
  });

  useEffect(() => {
    form.reset(extractDefaults(active));
  }, [active, form]);

  if (workspaces.length === 0) {
    return (
      <ShellStatusPanel
        title={t('settings.workspace.empty.title')}
        description={t('settings.workspace.empty.description')}
        tone="warning"
      />
    );
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!active) return;
    await onSave({ id: active.id, ...values });
  });

  const canSave = active !== null && form.formState.isValid;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {workspaces.length > 1 && (
        <ShellStatusPanel
          title={t('settings.workspace.selector.title')}
          description={t('settings.workspace.selector.description')}
        >
          <div className="max-w-xs">
            <Select {...(selectedId ? { value: selectedId } : {})} onValueChange={onSelect}>
              <SelectTrigger aria-label={t('settings.workspace.selector.ariaLabel')}>
                <SelectValue placeholder={t('settings.workspace.selector.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ShellStatusPanel>
      )}

      <ShellStatusPanel
        title={t('settings.workspace.identity.title')}
        description={t('settings.workspace.identity.description')}
        badge={t('settings.category.workspace.label')}
      >
        <div className="flex flex-col gap-3">
          <InputField
            control={form.control}
            name="name"
            label={t('settings.workspace.identity.name')}
            required={true}
          />
          <ReadOnlyField
            label={t('settings.workspace.identity.rootPath')}
            value={active?.rootPath ?? ''}
          />
          <ReadOnlyField label={t('settings.workspace.identity.slug')} value={active?.slug ?? ''} />
        </div>
      </ShellStatusPanel>

      <ShellStatusPanel
        title={t('settings.workspace.defaults.title')}
        description={t('settings.workspace.defaults.description')}
      >
        <div className="flex flex-col gap-3">
          <InputField
            control={form.control}
            name="workingDirectory"
            label={t('settings.workspace.defaults.workingDirectory')}
            placeholder={t('settings.workspace.defaults.workingDirectoryPlaceholder')}
          />
          <InputField
            control={form.control}
            name="projectsRootPath"
            label={t('settings.workspace.defaults.projectsRootPath')}
            placeholder={t('settings.workspace.defaults.projectsRootPathPlaceholder')}
          />
          <InputField
            control={form.control}
            name="llmConnectionSlug"
            label={t('settings.workspace.defaults.llmConnectionSlug')}
            placeholder={t('settings.workspace.defaults.llmConnectionSlugPlaceholder')}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!canSave || isSaving} size="sm">
            {isSaving ? t('settings.workspace.saving') : t('settings.workspace.save')}
          </Button>
        </div>
      </ShellStatusPanel>
    </form>
  );
}

function ReadOnlyField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <code className="block truncate rounded-md border border-border bg-muted/30 px-3 py-1.5 font-mono text-xs">
        {value || '—'}
      </code>
    </div>
  );
}
