/**
 * Converte lista plana de `Label` em árvore `LabelWithChildren` para
 * render de navegação. Ordenação alfabética por nível; `treeCode`
 * materialized-path garante reconstrução determinística.
 */

import type { Label } from '@g4os/kernel/types';
import type { LabelWithChildren } from '../types.ts';

export function buildLabelTree(labels: readonly Label[]): readonly LabelWithChildren[] {
  const nodes = new Map<string, LabelWithChildren & { children: LabelWithChildren[] }>();
  for (const label of labels) {
    nodes.set(label.id, { ...label, children: [] });
  }
  const roots: LabelWithChildren[] = [];
  for (const label of labels) {
    const node = nodes.get(label.id);
    if (!node) continue;
    if (label.parentId && nodes.has(label.parentId)) {
      nodes.get(label.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const node of nodes.values()) {
    node.children.sort(compareByName);
  }
  roots.sort(compareByName);
  return roots;
}

function compareByName(a: LabelWithChildren, b: LabelWithChildren): number {
  return a.name.localeCompare(b.name);
}

export function flattenLabels(
  tree: readonly LabelWithChildren[],
  depth = 0,
): ReadonlyArray<{ readonly label: LabelWithChildren; readonly depth: number }> {
  const out: Array<{ readonly label: LabelWithChildren; readonly depth: number }> = [];
  for (const node of tree) {
    out.push({ label: node, depth });
    out.push(...flattenLabels(node.children, depth + 1));
  }
  return out;
}
