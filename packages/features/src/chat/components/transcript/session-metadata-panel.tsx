import { Button, cn, useTranslate } from '@g4os/ui';
import { ChevronDown, FolderKanban, FolderOpen, Pencil, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface SessionMetadataProject {
  readonly id: string;
  readonly name: string;
  readonly color?: string | undefined;
}

export interface SessionMetadataPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;

  readonly name: string;
  readonly onRename?: (next: string) => void | Promise<void>;

  readonly project?: SessionMetadataProject | null;
  readonly availableProjects?: ReadonlyArray<SessionMetadataProject>;
  readonly onSelectProject?: (projectId: string | null) => void | Promise<void>;
  readonly onOpenProject?: (projectId: string) => void;

  readonly workingDirectory?: string | null;
  readonly onChooseWorkingDirectory?: () => void;

  readonly notes?: string;
  readonly onNotesChange?: (next: string) => void | Promise<void>;

  readonly children?: ReactNode;
}

const COLOR_FALLBACK = '#6366f1';

/**
 * Painel lateral direito com metadata da sessão atual: nome editável,
 * project linkado, working directory, notes livres, e slot extra para
 * blocos de files / extras. Renderiza colapsado/oculto via prop `open`
 * — composer/header ficam responsáveis pelo toggle.
 */
export function SessionMetadataPanel({
  open,
  onClose,
  name,
  onRename,
  project,
  availableProjects,
  onSelectProject,
  onOpenProject,
  workingDirectory,
  onChooseWorkingDirectory,
  notes,
  onNotesChange,
  children,
}: SessionMetadataPanelProps) {
  const { t } = useTranslate();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftNotes, setDraftNotes] = useState(notes ?? '');
  const [projectOpen, setProjectOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingName) setDraftName(name);
  }, [name, editingName]);

  useEffect(() => {
    setDraftNotes(notes ?? '');
  }, [notes]);

  useEffect(() => {
    if (editingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingName]);

  const commitName = (): void => {
    const trimmed = draftName.trim();
    setEditingName(false);
    if (trimmed && trimmed !== name && onRename) {
      void onRename(trimmed);
    } else {
      setDraftName(name);
    }
  };

  const cancelName = (): void => {
    setEditingName(false);
    setDraftName(name);
  };

  const commitNotes = (): void => {
    if (!onNotesChange) return;
    if (draftNotes !== (notes ?? '')) {
      void onNotesChange(draftNotes);
    }
  };

  // CR-UX: NÃO unmonta quando `open=false`. Em vez disso, anima width
  // de 320px → 0 + opacity → 0 em 200ms. Sem isso o painel aparecia/sumia
  // bruscamente ("cortando") e o usuário percebia como bug visual. O DOM
  // mantém o estado interno (drafts de nome/notes) entre toggles.
  return (
    <aside
      aria-label={t('chat.metadata.ariaLabel')}
      aria-hidden={!open}
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden border-l border-foreground/8 bg-background/60 backdrop-blur-sm transition-[width,opacity] duration-200 ease-in-out',
        open ? 'w-[320px] opacity-100' : 'pointer-events-none w-0 opacity-0',
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-foreground/8 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{t('chat.metadata.title')}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t('chat.metadata.close')}
          className="size-7"
        >
          <X className="size-4" aria-hidden={true} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {/* Name */}
        <Field label={t('chat.metadata.name')}>
          {editingName ? (
            <input
              ref={inputRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitName();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelName();
                }
              }}
              className="w-full rounded-md border border-foreground/15 bg-transparent px-2 py-1 text-sm font-medium text-foreground outline-none focus:border-foreground/40"
              aria-label={t('chat.metadata.name')}
            />
          ) : (
            <button
              type="button"
              onClick={() => onRename && setEditingName(true)}
              disabled={!onRename}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1 text-left text-sm font-medium text-foreground',
                onRename && 'cursor-text hover:border-foreground/15 hover:bg-accent/10',
              )}
            >
              <span className="truncate">{name}</span>
              {onRename ? (
                <Pencil className="size-3 shrink-0 text-muted-foreground" aria-hidden={true} />
              ) : null}
            </button>
          )}
        </Field>

        {/* Project */}
        <Field label={t('chat.metadata.project')}>
          {availableProjects && onSelectProject ? (
            <ProjectPicker
              project={project ?? null}
              available={availableProjects}
              open={projectOpen}
              onToggle={() => setProjectOpen((v) => !v)}
              onSelect={(id) => {
                setProjectOpen(false);
                void onSelectProject(id);
              }}
              {...(onOpenProject ? { onOpen: onOpenProject } : {})}
            />
          ) : project ? (
            <ProjectChip project={project} {...(onOpenProject ? { onOpen: onOpenProject } : {})} />
          ) : (
            <span className="text-xs text-muted-foreground">{t('chat.metadata.noProject')}</span>
          )}
        </Field>

        {/* Working dir */}
        {onChooseWorkingDirectory || workingDirectory ? (
          <Field label={t('chat.metadata.workingDir')}>
            <button
              type="button"
              onClick={onChooseWorkingDirectory}
              disabled={!onChooseWorkingDirectory}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-foreground/10 bg-foreground/[0.02] px-2 py-1.5 text-left text-xs',
                onChooseWorkingDirectory && 'cursor-pointer hover:bg-accent/12',
              )}
            >
              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
              <span
                className="truncate font-mono text-foreground/85"
                title={workingDirectory ?? ''}
              >
                {workingDirectory ?? t('chat.metadata.workingDirEmpty')}
              </span>
            </button>
          </Field>
        ) : null}

        {/* Notes */}
        {onNotesChange ? (
          <Field label={t('chat.metadata.notes')}>
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              onBlur={commitNotes}
              placeholder={t('chat.metadata.notesPlaceholder')}
              className="min-h-[80px] w-full resize-y rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/40"
            />
          </Field>
        ) : null}

        {children}
      </div>
    </aside>
  );
}

interface FieldProps {
  readonly label: string;
  readonly children: ReactNode;
}
function Field({ label, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}

interface ProjectChipProps {
  readonly project: SessionMetadataProject;
  readonly onOpen?: (projectId: string) => void;
}
function ProjectChip({ project, onOpen }: ProjectChipProps) {
  const accent = project.color ?? COLOR_FALLBACK;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(project.id)}
      disabled={!onOpen}
      className={cn(
        'flex w-full items-center gap-2 rounded-md border border-foreground/10 bg-foreground/[0.02] px-2 py-1.5 text-left text-xs',
        onOpen && 'cursor-pointer hover:bg-accent/12',
      )}
    >
      <span
        aria-hidden={true}
        className="flex size-5 shrink-0 items-center justify-center rounded-md text-background"
        style={{ backgroundColor: accent }}
      >
        <FolderKanban className="size-3" />
      </span>
      <span className="truncate text-foreground/85">{project.name}</span>
    </button>
  );
}

interface ProjectPickerProps {
  readonly project: SessionMetadataProject | null;
  readonly available: ReadonlyArray<SessionMetadataProject>;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onSelect: (id: string | null) => void;
  readonly onOpen?: (projectId: string) => void;
}
function ProjectPicker({
  project,
  available,
  open,
  onToggle,
  onSelect,
  onOpen,
}: ProjectPickerProps) {
  const { t } = useTranslate();
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-foreground/10 bg-foreground/[0.02] px-2 py-1.5 text-left text-xs hover:bg-accent/12"
      >
        <span className="flex min-w-0 items-center gap-2">
          {project ? (
            <span
              aria-hidden={true}
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color ?? COLOR_FALLBACK }}
            />
          ) : null}
          <span className="truncate text-foreground/85">
            {project?.name ?? t('chat.metadata.noProject')}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden={true}
        />
      </button>
      {open ? (
        <ul className="max-h-44 overflow-y-auto rounded-md border border-foreground/10 bg-background py-1">
          <li>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="flex w-full items-center px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent/12"
            >
              {t('chat.metadata.noProject')}
            </button>
          </li>
          {available.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-accent/12"
              >
                <span
                  aria-hidden={true}
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color ?? COLOR_FALLBACK }}
                />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {project && onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(project.id)}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {t('chat.metadata.openProject')}
        </button>
      ) : null}
    </div>
  );
}
