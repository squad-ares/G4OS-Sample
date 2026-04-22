import type { ProjectFile } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { X } from 'lucide-react';

export interface ProjectFilesPanelProps {
  readonly projectId: string;
  readonly files: readonly ProjectFile[];
  readonly loading?: boolean;
  readonly onOpen?: (relativePath: string) => void;
  readonly onDelete?: (relativePath: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'img';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('typescript') || mimeType.includes('javascript')) return 'ts';
  if (mimeType === 'text/markdown') return 'md';
  if (mimeType === 'application/json') return '{}';
  return 'txt';
}

export function ProjectFilesPanel({ files, loading, onOpen, onDelete }: ProjectFilesPanelProps) {
  const { t } = useTranslate();

  if (loading) {
    return (
      <div className="flex flex-col gap-1">
        {(['sk-a', 'sk-b', 'sk-c', 'sk-d'] as const).map((k) => (
          <div key={k} className="h-8 rounded bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{t('project.files.empty')}</p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-md border border-border">
      {files.map((f) => (
        <div
          key={f.relativePath}
          className="group flex items-center gap-3 px-3 py-2 hover:bg-accent/30"
        >
          <span className="text-base">{fileIcon(f.mimeType)}</span>
          <button
            type="button"
            className="flex-1 truncate text-left text-sm hover:underline"
            onClick={() => onOpen?.(f.relativePath)}
          >
            {f.relativePath}
          </button>
          <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
          {!f.canSync && (
            <span className="text-xs text-amber-500" title={t('project.files.localTitle')}>
              {t('project.files.local')}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
            onClick={() => onDelete?.(f.relativePath)}
            aria-label={t('project.files.deleteAriaLabel')}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
