/**
 * LabelsRepository — labels hierárquicos por workspace (TASK-11-01-07).
 *
 * `treeCode` é materialized-path: raiz tem `code` randômico de 4 chars,
 * filhos concatenam `parent.code + "." + own.code`. Isso permite filtrar
 * "tudo sob Área" com um `LIKE tree_code || '.%'` sem CTE recursiva.
 *
 * `rename` não mexe em `treeCode`; só `reparent` recalcula (cascata nos
 * descendentes). A cascata é responsabilidade do chamador (serviço) para
 * poder ser orquestrada numa transação única junto com eventos.
 */

import type { Label, LabelCreateInput, LabelId } from '@g4os/kernel/types';
import { and, eq, like } from 'drizzle-orm';
import type { AppDb } from '../drizzle.ts';
import { labels as labelsTable } from '../schema/index.ts';
import type { Label as RowLabel } from '../schema/labels.ts';

const TREE_CODE_SEGMENT_LENGTH = 4;

export class LabelsRepository {
  constructor(private readonly db: AppDb) {}

  async list(workspaceId: string): Promise<readonly Label[]> {
    const rows = await this.db
      .select()
      .from(labelsTable)
      .where(eq(labelsTable.workspaceId, workspaceId));
    return rows.map(rowToLabel);
  }

  async get(id: LabelId): Promise<Label | null> {
    const rows = await this.db.select().from(labelsTable).where(eq(labelsTable.id, id)).limit(1);
    const row = rows[0];
    return row ? rowToLabel(row) : null;
  }

  async create(input: LabelCreateInput): Promise<Label> {
    const id = crypto.randomUUID();
    const parentCode = input.parentId ? await this.getTreeCode(input.parentId) : null;
    const ownSegment = randomSegment();
    const treeCode = parentCode ? `${parentCode}.${ownSegment}` : ownSegment;
    const now = Date.now();
    await this.db.insert(labelsTable).values({
      id,
      workspaceId: input.workspaceId,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      name: input.name,
      ...(input.color ? { color: input.color } : {}),
      treeCode,
      createdAt: now,
      updatedAt: now,
    });
    const created = await this.get(id);
    if (!created) throw new Error('inserted label not found');
    return created;
  }

  async rename(id: LabelId, name: string): Promise<void> {
    await this.db
      .update(labelsTable)
      .set({ name, updatedAt: Date.now() })
      .where(eq(labelsTable.id, id));
  }

  async recolor(id: LabelId, color: string | null): Promise<void> {
    await this.db
      .update(labelsTable)
      .set({ color, updatedAt: Date.now() })
      .where(eq(labelsTable.id, id));
  }

  /**
   * Move a label para um novo parent. Recalcula `treeCode` desta label e
   * de todos os descendentes. Não detecta ciclos — o serviço deve validar
   * antes (new parent nunca pode ser descendente da label movida).
   */
  async reparent(id: LabelId, newParentId: LabelId | null): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error(`label ${id} not found`);

    const parentCode = newParentId ? await this.getTreeCode(newParentId) : null;
    const ownSegment = current.treeCode.split('.').at(-1) ?? randomSegment();
    const newTreeCode = parentCode ? `${parentCode}.${ownSegment}` : ownSegment;

    const descendants = await this.db
      .select()
      .from(labelsTable)
      .where(
        and(
          eq(labelsTable.workspaceId, current.workspaceId),
          like(labelsTable.treeCode, `${current.treeCode}.%`),
        ),
      );
    const now = Date.now();
    await this.db
      .update(labelsTable)
      .set({
        parentId: newParentId,
        treeCode: newTreeCode,
        updatedAt: now,
      })
      .where(eq(labelsTable.id, id));
    for (const desc of descendants) {
      const remainder = desc.treeCode.slice(current.treeCode.length);
      await this.db
        .update(labelsTable)
        .set({ treeCode: `${newTreeCode}${remainder}`, updatedAt: now })
        .where(eq(labelsTable.id, desc.id));
    }
  }

  async delete(id: LabelId): Promise<void> {
    await this.db.delete(labelsTable).where(eq(labelsTable.id, id));
  }

  private async getTreeCode(id: LabelId): Promise<string> {
    const label = await this.get(id);
    if (!label) throw new Error(`parent label ${id} not found`);
    return label.treeCode;
  }
}

function rowToLabel(row: RowLabel): Label {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ...(row.parentId ? { parentId: row.parentId } : {}),
    name: row.name,
    ...(row.color ? { color: row.color } : {}),
    treeCode: row.treeCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function randomSegment(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TREE_CODE_SEGMENT_LENGTH));
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (const byte of bytes) {
    out += chars.charAt(byte % chars.length);
  }
  return out;
}
