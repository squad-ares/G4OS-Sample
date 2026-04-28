/**
 * LabelsManager — tree editor para as labels hierárquicas do workspace.
 * Cria labels raiz (sem parent) ou criança (com botão "+" em cada item).
 * Deletar cascada (FK `ON DELETE CASCADE`) remove descendentes.
 */

import type { Label } from '@g4os/kernel/types';
import { Button, Input, useTranslate } from '@g4os/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { buildLabelTree, flattenLabels } from '../logic/label-tree.ts';
import type { LabelWithChildren } from '../types.ts';

export interface LabelsManagerProps {
  readonly labels: readonly Label[];
  readonly onCreate: (input: { readonly name: string; readonly parentId?: string }) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
}

export function LabelsManager({ labels, onCreate, onRename, onDelete }: LabelsManagerProps) {
  const { t } = useTranslate();
  const tree = buildLabelTree(labels);
  const flat = flattenLabels(tree);
  const [newRootName, setNewRootName] = useState('');

  const submitRoot = (): void => {
    const name = newRootName.trim();
    if (name.length === 0) return;
    onCreate({ name });
    setNewRootName('');
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">{t('session.labels.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('session.labels.description')}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={newRootName}
          onChange={(event) => setNewRootName(event.target.value)}
          placeholder={t('session.labels.placeholder')}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitRoot();
            }
          }}
        />
        <Button size="sm" onClick={submitRoot} disabled={newRootName.trim().length === 0}>
          <Plus className="size-4" aria-hidden={true} />
          {t('session.labels.create')}
        </Button>
      </div>
      {flat.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          {t('session.labels.empty')}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {flat.map(({ label, depth }) => (
            <LabelRow
              key={label.id}
              label={label}
              depth={depth}
              onRename={onRename}
              onDelete={onDelete}
              onCreateChild={(parentId, name) => onCreate({ name, parentId })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface LabelRowProps {
  readonly label: LabelWithChildren;
  readonly depth: number;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onCreateChild: (parentId: string, name: string) => void;
}

function LabelRow({ label, depth, onRename, onDelete, onCreateChild }: LabelRowProps) {
  const { t } = useTranslate();
  const [isEditing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label.name);
  const [childName, setChildName] = useState<string | null>(null);

  return (
    <li
      style={{ paddingLeft: depth * 16 }}
      className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent/12"
    >
      {label.color ? (
        <span
          aria-hidden={true}
          className="size-2.5 rounded-full"
          style={{ backgroundColor: label.color }}
        />
      ) : null}
      {isEditing ? (
        <Input
          autoFocus={true}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = draft.trim();
            if (next.length > 0 && next !== label.name) onRename(label.id, next);
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(label.name);
              setEditing(false);
            }
          }}
          className="h-7"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 truncate text-left"
        >
          {label.name}
        </button>
      )}
      {childName === null ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setChildName('')}
          aria-label={t('session.labels.create')}
        >
          <Plus className="size-3" aria-hidden={true} />
        </Button>
      ) : (
        <Input
          autoFocus={true}
          value={childName}
          onChange={(event) => setChildName(event.target.value)}
          onBlur={() => {
            const next = childName?.trim() ?? '';
            if (next.length > 0) onCreateChild(label.id, next);
            setChildName(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setChildName(null);
          }}
          placeholder={t('session.labels.placeholder')}
          className="h-7 w-32"
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(label.id)}
        aria-label={t('session.labels.delete')}
      >
        <Trash2 className="size-3" aria-hidden={true} />
      </Button>
    </li>
  );
}
