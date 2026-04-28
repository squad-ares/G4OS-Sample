/**
 * BranchTree — renderiza a árvore parent → branches de uma sessão.
 * Não faz lookup recursivo: recebe o array plano e monta a árvore via
 * `parentId`. Sessão atual é destacada com `aria-current="page"`.
 */

import type { Session } from '@g4os/kernel/types';
import { useTranslate } from '@g4os/ui';
import { GitBranch } from 'lucide-react';
import { useMemo } from 'react';

export interface BranchTreeProps {
  readonly root: Session;
  readonly branches: readonly Session[];
  readonly currentSessionId: string;
  readonly onSelect: (sessionId: string) => void;
}

interface Node {
  readonly session: Session;
  readonly children: Node[];
}

export function BranchTree({ root, branches, currentSessionId, onSelect }: BranchTreeProps) {
  const { t } = useTranslate();
  const tree = useMemo(() => buildTree(root, branches), [root, branches]);

  if (tree.children.length === 0) {
    return (
      <div className="px-2 py-3 text-xs text-muted-foreground">
        {t('session.branch.emptyDescription')}
      </div>
    );
  }

  return (
    <nav aria-label={t('session.branch.heading')} className="flex flex-col gap-1">
      <NodeItem node={tree} currentId={currentSessionId} onSelect={onSelect} depth={0} />
    </nav>
  );
}

interface NodeItemProps {
  readonly node: Node;
  readonly currentId: string;
  readonly onSelect: (sessionId: string) => void;
  readonly depth: number;
}

function NodeItem({ node, currentId, onSelect, depth }: NodeItemProps) {
  const isCurrent = node.session.id === currentId;
  return (
    <div style={{ paddingLeft: depth * 12 }} className="flex flex-col">
      <button
        type="button"
        onClick={() => onSelect(node.session.id)}
        aria-current={isCurrent ? 'page' : undefined}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
          isCurrent
            ? 'bg-accent/10 font-medium text-foreground'
            : 'text-foreground/80 hover:bg-accent/12'
        }`}
      >
        {depth > 0 ? (
          <GitBranch className="size-3 shrink-0 text-muted-foreground" aria-hidden={true} />
        ) : null}
        <span className="truncate">{node.session.name}</span>
      </button>
      {node.children.map((child) => (
        <NodeItem
          key={child.session.id}
          node={child}
          currentId={currentId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function buildTree(root: Session, branches: readonly Session[]): Node {
  const children = branches
    .filter((b) => b.parentId === root.id)
    .map((b) => buildTree(b, branches));
  return { session: root, children };
}
