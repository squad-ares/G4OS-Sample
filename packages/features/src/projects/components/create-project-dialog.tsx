import type { ProjectCreateInput } from '@g4os/kernel/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useTranslate,
} from '@g4os/ui';
import { useState } from 'react';

export interface CreateProjectDialogProps {
  readonly workspaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: ProjectCreateInput) => Promise<void>;
}

const PRESET_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7'];

export function CreateProjectDialog({
  workspaceId,
  open,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const { t } = useTranslate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0] ?? '#6366f1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setDescription('');
    setColor(PRESET_COLORS[0] ?? '#6366f1');
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nome é obrigatório.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        workspaceId,
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        color,
      });
      handleOpenChange(false);
    } catch {
      setError('Erro ao criar projeto. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('project.dialog.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">{t('project.dialog.name.label')}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('project.dialog.name.placeholder')}
              autoFocus={true}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-desc">{t('project.dialog.description.label')}</Label>
            <Input
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('project.dialog.description.placeholder')}
            />
          </div>

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

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              {t('project.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? t('project.dialog.creating') : t('project.dialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
