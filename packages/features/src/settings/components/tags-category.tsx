import type { Label } from '@g4os/kernel/types';
import { Button, InputField, useTranslate } from '@g4os/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ShellStatusPanel } from '../../shell/index.ts';

export interface TagsCategoryProps {
  readonly labels: readonly Label[];
  readonly onCreate: (input: { name: string; color: string | null }) => Promise<void>;
  readonly onRename: (id: string, name: string) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly isMutating?: boolean;
  readonly workspaceMissing?: boolean;
}

const COLOR_PRESETS: readonly string[] = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
];

const createTagSchema = z.object({
  name: z.string().trim().min(1),
});

type CreateTagFormValues = z.infer<typeof createTagSchema>;

export function TagsCategory({
  labels,
  onCreate,
  onRename,
  onDelete,
  isMutating,
  workspaceMissing,
}: TagsCategoryProps) {
  const { t } = useTranslate();
  const [newColor, setNewColor] = useState<string | null>(COLOR_PRESETS[0] ?? null);

  const form = useForm<CreateTagFormValues>({
    resolver: zodResolver(createTagSchema),
    defaultValues: { name: '' },
    mode: 'onChange',
  });

  if (workspaceMissing) {
    return (
      <ShellStatusPanel
        title={t('settings.tags.empty.title')}
        description={t('settings.tags.empty.description')}
        tone="warning"
      />
    );
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    await onCreate({ name: values.name.trim(), color: newColor });
    form.reset({ name: '' });
  });

  return (
    <div className="flex flex-col gap-4">
      <ShellStatusPanel
        title={t('settings.tags.create.title')}
        description={t('settings.tags.create.description')}
        badge={t('settings.category.tags.label')}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <InputField
            control={form.control}
            name="name"
            label={t('settings.tags.create.nameLabel')}
            placeholder={t('settings.tags.create.namePlaceholder')}
          />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {t('settings.tags.create.colorLabel')}
            </span>
            {COLOR_PRESETS.map((color) => {
              const selected = color === newColor;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  aria-pressed={selected}
                  aria-label={color}
                  className={`h-6 w-6 rounded-full border-2 transition ${
                    selected ? 'border-foreground' : 'border-transparent hover:border-border'
                  }`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
            <button
              type="button"
              onClick={() => setNewColor(null)}
              aria-pressed={newColor === null}
              className={`rounded-md border px-2 py-1 text-[11px] transition ${
                newColor === null
                  ? 'border-foreground bg-muted'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {t('settings.tags.create.noColor')}
            </button>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isMutating || !form.formState.isValid}>
              {t('settings.tags.create.submit')}
            </Button>
          </div>
        </form>
      </ShellStatusPanel>

      <ShellStatusPanel
        title={t('settings.tags.list.title')}
        description={t('settings.tags.list.description', { count: labels.length })}
      >
        {labels.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settings.tags.list.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {labels.map((label) => (
              <TagRow
                key={label.id}
                label={label}
                labels={labels}
                onRename={onRename}
                onDelete={onDelete}
                disabled={isMutating === true}
              />
            ))}
          </ul>
        )}
      </ShellStatusPanel>
    </div>
  );
}

interface TagRowProps {
  readonly label: Label;
  readonly labels: readonly Label[];
  readonly onRename: (id: string, name: string) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly disabled: boolean;
}

function TagRow({ label, labels, onRename, onDelete, disabled }: TagRowProps) {
  const { t } = useTranslate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const parent = label.parentId
    ? (labels.find((l) => l.id === label.parentId)?.name ?? null)
    : null;

  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== label.name) {
      await onRename(label.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <span
        className="h-3 w-3 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: label.color ?? 'transparent' }}
        aria-hidden={true}
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit();
              if (e.key === 'Escape') {
                setDraft(label.name);
                setEditing(false);
              }
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="truncate text-left font-medium hover:underline"
          >
            {label.name}
          </button>
        )}
        {parent && (
          <span className="ml-2 text-xs text-muted-foreground">
            {t('settings.tags.list.parent', { parent })}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => void onDelete(label.id)}
        disabled={disabled}
        aria-label={t('settings.tags.list.delete')}
        className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
