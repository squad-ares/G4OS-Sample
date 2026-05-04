/**
 * CR-28 F-CR28-3 — Chip inline com o projeto linkado, exibido no
 * `SessionTitleBar.projectBadge` slot. Paridade V1 que mostrava
 * `FolderKanban` + nome do projeto direto no header (V1
 * `ChatPage.tsx:936-952`).
 *
 * Click navega para a página do projeto. Cor do projeto (se definida)
 * pinta o ícone; fallback indigo quando project.color é undefined.
 */

import { cn } from '@g4os/ui';
import type { useNavigate } from '@tanstack/react-router';
import { FolderKanban } from 'lucide-react';

const FALLBACK_COLOR = '#6366f1';

interface ProjectBadgeProps {
  readonly project: {
    readonly id: string;
    readonly name: string;
    /** `string | undefined` (não apenas optional) — alinhado a
     *  `SessionMetadataProject` do `@g4os/features/chat` sob
     *  `exactOptionalPropertyTypes: true`. */
    readonly color?: string | undefined;
  };
  readonly navigate: ReturnType<typeof useNavigate>;
  readonly className?: string;
}

export function ProjectBadge({ project, navigate, className }: ProjectBadgeProps) {
  const accent = project.color ?? FALLBACK_COLOR;
  return (
    <button
      type="button"
      onClick={() =>
        void navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
      }
      className={cn(
        'inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-2 py-0.5 text-[11px] text-foreground/85 transition-colors hover:border-foreground/20 hover:bg-accent/12 hover:text-foreground',
        className,
      )}
      title={project.name}
      aria-label={`Project: ${project.name}`}
    >
      <span
        aria-hidden={true}
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
      />
      <FolderKanban className="size-3 shrink-0 text-muted-foreground" aria-hidden={true} />
      <span className="truncate">{project.name}</span>
    </button>
  );
}
