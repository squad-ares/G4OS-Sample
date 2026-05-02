/**
 * SessionsRepository — CRUD + filtros + lifecycle (archive/delete/restore)
 * + branching (parentId/branchedAtSeq) + flags (pinned/starred/unread).
 *
 * Repository fino sobre `AppDb`. Não emite eventos — a camada de serviço
 * (apps/desktop) é quem publica `session.archived`/`session.deleted`/
 * `session.restored` no event log antes de persistir aqui.
 *
 * Todas as mutações atualizam `updatedAt`. `hardDelete` é purge físico
 * (usado pelo scheduler após 30d); delete normal é soft via `lifecycle`.
 */

import type { Session, SessionFilter, SessionId } from '@g4os/kernel/types';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, type SQL, sql } from 'drizzle-orm';
import type { AppDb } from '../drizzle.ts';
import { sessionLabels, sessions as sessionsTable } from '../schema/index.ts';
import type { Session as RowSession } from '../schema/sessions.ts';

export interface SessionWithLabels extends Session {
  readonly labelDetails?: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

export class SessionsRepository {
  constructor(private readonly db: AppDb) {}

  async list(filter: SessionFilter): Promise<readonly Session[]> {
    const clauses = this.buildWhereClauses(filter);
    let sessionIdsFromLabels: readonly string[] | null = null;
    if (filter.labelIds && filter.labelIds.length > 0) {
      const rows = await this.db
        .select({ sessionId: sessionLabels.sessionId })
        .from(sessionLabels)
        .where(inArray(sessionLabels.labelId, [...filter.labelIds]));
      sessionIdsFromLabels = rows.map((r) => r.sessionId);
      if (sessionIdsFromLabels.length === 0) return [];
      clauses.push(inArray(sessionsTable.id, [...sessionIdsFromLabels]));
    }
    const rows = await this.db
      .select()
      .from(sessionsTable)
      .where(clauses.length === 0 ? undefined : and(...clauses))
      .orderBy(desc(sessionsTable.pinnedAt), desc(sessionsTable.updatedAt))
      .limit(filter.limit)
      .offset(filter.offset);

    return rows.map(rowToSession);
  }

  async count(filter: SessionFilter): Promise<number> {
    const clauses = this.buildWhereClauses(filter);
    const rows = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(sessionsTable)
      .where(clauses.length === 0 ? undefined : and(...clauses));
    return Number(rows[0]?.count ?? 0);
  }

  async get(id: SessionId): Promise<Session | null> {
    const rows = await this.db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, id))
      .limit(1);
    const row = rows[0];
    return row ? rowToSession(row) : null;
  }

  async create(input: Pick<Session, 'workspaceId' | 'name'> & Partial<Session>): Promise<Session> {
    const now = Date.now();
    const id = input.id ?? crypto.randomUUID();
    const values = {
      id,
      workspaceId: input.workspaceId,
      name: input.name,
      status: input.status === 'archived' ? ('archived' as const) : ('active' as const),
      createdAt: now,
      updatedAt: now,
      metadata: JSON.stringify(input.metadata ?? { turnCount: 0 }),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.parentId ? { parentId: input.parentId } : {}),
      ...(input.branchedAtSeq === undefined ? {} : { branchedAtSeq: input.branchedAtSeq }),
    };
    await this.db.insert(sessionsTable).values(values);
    const inserted = await this.get(id);
    if (!inserted) throw new Error('inserted session not found');
    return inserted;
  }

  async update(id: SessionId, patch: Partial<Session>): Promise<void> {
    const updates: Partial<RowSession> = { updatedAt: Date.now() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.messageCount !== undefined) updates.messageCount = patch.messageCount;
    if (patch.lastMessageAt !== undefined) updates.lastMessageAt = patch.lastMessageAt;
    if (patch.lastEventSequence !== undefined) updates.lastEventSequence = patch.lastEventSequence;
    if (patch.metadata !== undefined) updates.metadata = JSON.stringify(patch.metadata);
    if (patch.projectId !== undefined) updates.projectId = patch.projectId;
    if (patch.unread !== undefined) updates.unread = patch.unread;
    if (patch.provider !== undefined) updates.provider = patch.provider;
    if (patch.modelId !== undefined) updates.modelId = patch.modelId;
    if (patch.workingDirectory !== undefined) updates.workingDirectory = patch.workingDirectory;
    if (patch.enabledSourceSlugs !== undefined) {
      updates.enabledSourceSlugsJson = JSON.stringify(patch.enabledSourceSlugs);
    }
    if (patch.stickyMountedSourceSlugs !== undefined) {
      updates.stickyMountedSourceSlugsJson = JSON.stringify(patch.stickyMountedSourceSlugs);
    }
    if (patch.rejectedSourceSlugs !== undefined) {
      updates.rejectedSourceSlugsJson = JSON.stringify(patch.rejectedSourceSlugs);
    }
    await this.db.update(sessionsTable).set(updates).where(eq(sessionsTable.id, id));
  }

  async archive(id: SessionId): Promise<void> {
    const now = Date.now();
    await this.db
      .update(sessionsTable)
      .set({ status: 'archived', archivedAt: now, updatedAt: now })
      .where(eq(sessionsTable.id, id));
  }

  async softDelete(id: SessionId): Promise<void> {
    const now = Date.now();
    await this.db
      .update(sessionsTable)
      .set({ status: 'deleted', deletedAt: now, updatedAt: now })
      .where(eq(sessionsTable.id, id));
  }

  async restore(id: SessionId): Promise<void> {
    const now = Date.now();
    await this.db
      .update(sessionsTable)
      .set({
        status: 'active',
        deletedAt: null,
        archivedAt: null,
        updatedAt: now,
      })
      .where(eq(sessionsTable.id, id));
  }

  async pin(id: SessionId): Promise<void> {
    const now = Date.now();
    await this.db
      .update(sessionsTable)
      .set({ pinnedAt: now, updatedAt: now })
      .where(eq(sessionsTable.id, id));
  }

  async unpin(id: SessionId): Promise<void> {
    await this.db
      .update(sessionsTable)
      .set({ pinnedAt: null, updatedAt: Date.now() })
      .where(eq(sessionsTable.id, id));
  }

  async star(id: SessionId): Promise<void> {
    const now = Date.now();
    await this.db
      .update(sessionsTable)
      .set({ starredAt: now, updatedAt: now })
      .where(eq(sessionsTable.id, id));
  }

  async unstar(id: SessionId): Promise<void> {
    await this.db
      .update(sessionsTable)
      .set({ starredAt: null, updatedAt: Date.now() })
      .where(eq(sessionsTable.id, id));
  }

  async markRead(id: SessionId): Promise<void> {
    // CR-23 F-CR23-6a: atualiza `updatedAt` para que filtros por
    // `updatedAfter`/`updatedBefore` reflitam mudanças em read/unread state.
    // Outras mutações (pin/star/archive) já atualizavam — markRead/markUnread
    // estavam inconsistentes, fazendo "unread→read" parecer não-mutação no
    // diff de listagem.
    await this.db
      .update(sessionsTable)
      .set({ unread: false, updatedAt: Date.now() })
      .where(eq(sessionsTable.id, id));
  }

  async markUnread(id: SessionId): Promise<void> {
    await this.db
      .update(sessionsTable)
      .set({ unread: true, updatedAt: Date.now() })
      .where(eq(sessionsTable.id, id));
  }

  async hardDelete(id: SessionId): Promise<void> {
    await this.db.delete(sessionsTable).where(eq(sessionsTable.id, id));
  }

  async findPurgeable(olderThan: number): Promise<readonly SessionId[]> {
    const rows = await this.db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.status, 'deleted'),
          isNotNull(sessionsTable.deletedAt),
          lt(sessionsTable.deletedAt, olderThan),
        ),
      );
    return rows.map((r) => r.id);
  }

  async listBranches(parentId: SessionId): Promise<readonly Session[]> {
    const rows = await this.db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.parentId, parentId))
      .orderBy(asc(sessionsTable.createdAt));
    return rows.map(rowToSession);
  }

  async listAncestors(id: SessionId): Promise<readonly Session[]> {
    const out: Session[] = [];
    // CR-23 F-CR23-2: cycle detection. Sem `visited`, parent chain corrompida
    // (`A → B → A`) faz loop infinito e satura SQLite WAL — DoS local em dado
    // mal-formado. Ciclo natural não acontece em uso normal mas pode escapar
    // de migrações V1→V2 / restore parcial / bug em ponto de mutação fora do
    // repository. Walker padrão tem guard de visited.
    const visited = new Set<SessionId>();
    let current = await this.get(id);
    if (current) visited.add(current.id);
    while (current?.parentId) {
      if (visited.has(current.parentId)) break;
      const parent = await this.get(current.parentId);
      if (!parent) break;
      visited.add(parent.id);
      out.push(parent);
      current = parent;
    }
    return out;
  }

  async setLabels(sessionId: SessionId, labelIds: readonly string[]): Promise<void> {
    await this.db.delete(sessionLabels).where(eq(sessionLabels.sessionId, sessionId));
    if (labelIds.length === 0) return;
    const now = Date.now();
    const rows = labelIds.map((labelId) => ({ sessionId, labelId, attachedAt: now }));
    await this.db.insert(sessionLabels).values(rows);
  }

  async getLabelIds(sessionId: SessionId): Promise<readonly string[]> {
    const rows = await this.db
      .select({ labelId: sessionLabels.labelId })
      .from(sessionLabels)
      .where(eq(sessionLabels.sessionId, sessionId));
    return rows.map((r) => r.labelId);
  }

  async listByProject(projectId: string): Promise<readonly Session[]> {
    const rows = await this.db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.projectId, projectId), eq(sessionsTable.status, 'active')))
      .orderBy(desc(sessionsTable.updatedAt));
    return rows.map(rowToSession);
  }

  private buildWhereClauses(filter: SessionFilter): SQL[] {
    const clauses: SQL[] = [eq(sessionsTable.workspaceId, filter.workspaceId)];

    const lifecycle = filter.lifecycle ?? 'active';
    clauses.push(eq(sessionsTable.status, lifecycle));

    if (filter.projectId !== undefined) {
      clauses.push(eq(sessionsTable.projectId, filter.projectId));
    }
    if (filter.pinned === true) clauses.push(isNotNull(sessionsTable.pinnedAt));
    if (filter.pinned === false) clauses.push(isNull(sessionsTable.pinnedAt));
    if (filter.starred === true) clauses.push(isNotNull(sessionsTable.starredAt));
    if (filter.starred === false) clauses.push(isNull(sessionsTable.starredAt));
    if (filter.unread === true) clauses.push(eq(sessionsTable.unread, true));
    if (filter.unread === false) clauses.push(eq(sessionsTable.unread, false));
    if (filter.includeBranches !== true) {
      clauses.push(isNull(sessionsTable.parentId));
    }
    if (filter.updatedAfter !== undefined) {
      clauses.push(gt(sessionsTable.updatedAt, filter.updatedAfter));
    }
    if (filter.updatedBefore !== undefined) {
      clauses.push(lt(sessionsTable.updatedAt, filter.updatedBefore));
    }
    if (filter.text !== undefined && filter.text.trim().length > 0) {
      // CR-23 F-CR23-5: escape `_` (single-char wildcard) e `\` (escape char)
      // além de `%`. Sem isso, busca por `Project_42` matchava `Project-42`,
      // `ProjectX42`, etc — falsos positivos silenciosos. Cláusula ESCAPE '\\'
      // sinaliza que o prefixo `\` desativa o significado especial dos
      // caracteres seguintes em SQLite LIKE.
      const escaped = filter.text
        .trim()
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      clauses.push(sql`${sessionsTable.name} LIKE ${`%${escaped}%`} ESCAPE '\\'`);
    }
    return clauses;
  }
}

function rowToSession(row: RowSession): Session {
  let metadata: Session['metadata'];
  try {
    metadata = JSON.parse(row.metadata) as Session['metadata'];
  } catch {
    metadata = { turnCount: 0 };
  }
  const base: Session = {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: 'idle',
    lifecycle: row.status,
    enabledSourceSlugs: parseSlugArray(row.enabledSourceSlugsJson),
    stickyMountedSourceSlugs: parseSlugArray(row.stickyMountedSourceSlugsJson),
    rejectedSourceSlugs: parseSlugArray(row.rejectedSourceSlugsJson),
    labels: [],
    unread: row.unread,
    messageCount: row.messageCount,
    lastEventSequence: row.lastEventSequence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata,
  };
  return {
    ...base,
    ...(row.projectId ? { projectId: row.projectId } : {}),
    ...(row.parentId ? { parentId: row.parentId } : {}),
    ...(row.branchedAtSeq === null ? {} : { branchedAtSeq: row.branchedAtSeq }),
    ...(row.pinnedAt === null ? {} : { pinnedAt: row.pinnedAt }),
    ...(row.starredAt === null ? {} : { starredAt: row.starredAt }),
    ...(row.archivedAt === null ? {} : { archivedAt: row.archivedAt }),
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
    ...(row.lastMessageAt === null ? {} : { lastMessageAt: row.lastMessageAt }),
    ...(row.provider ? { provider: row.provider as Session['provider'] } : {}),
    ...(row.modelId ? { modelId: row.modelId } : {}),
    ...(row.workingDirectory ? { workingDirectory: row.workingDirectory } : {}),
  };
}

function parseSlugArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    return [];
  }
}
