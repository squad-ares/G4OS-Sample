import type {
  ProjectId,
  ProjectTask,
  ProjectTaskCreateInput,
  ProjectTaskId,
  ProjectTaskPatch,
} from '@g4os/kernel/types';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { AppDb } from '../drizzle.ts';
import { projectTasks as tasksTable } from '../schema/index.ts';
import type { ProjectTaskRow } from '../schema/project-tasks.ts';

export class ProjectTasksRepository {
  constructor(private readonly db: AppDb) {}

  async list(projectId: ProjectId): Promise<readonly ProjectTask[]> {
    const rows = await this.db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.projectId, projectId))
      .orderBy(asc(tasksTable.order), asc(tasksTable.createdAt));
    return rows.map(rowToTask);
  }

  async listByStatus(
    projectId: ProjectId,
    status: ProjectTask['status'],
  ): Promise<readonly ProjectTask[]> {
    const rows = await this.db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.status, status)))
      .orderBy(asc(tasksTable.order));
    return rows.map(rowToTask);
  }

  async get(id: ProjectTaskId): Promise<ProjectTask | null> {
    const rows = await this.db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    const row = rows[0];
    return row ? rowToTask(row) : null;
  }

  async create(input: ProjectTaskCreateInput): Promise<ProjectTask> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const order = await this.nextOrder(input.projectId);
    await this.db.insert(tasksTable).values({
      id,
      projectId: input.projectId,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      status: input.status ?? 'todo',
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      labels: JSON.stringify(input.labels ?? []),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      order,
      createdAt: now,
    });
    const created = await this.get(id);
    if (!created) throw new Error('inserted task not found');
    return created;
  }

  async update(id: ProjectTaskId, patch: ProjectTaskPatch): Promise<void> {
    const set: Record<string, unknown> = {};
    if (patch.title !== undefined) set['title'] = patch.title;
    if (patch.description !== undefined) set['description'] = patch.description;
    if (patch.status !== undefined) {
      set['status'] = patch.status;
      set['completedAt'] = patch.status === 'done' ? Date.now() : null;
    }
    if (patch.priority !== undefined) set['priority'] = patch.priority;
    if (patch.assigneeId !== undefined) set['assigneeId'] = patch.assigneeId;
    if (patch.dueAt !== undefined) set['dueAt'] = patch.dueAt;
    if (patch.labels !== undefined) set['labels'] = JSON.stringify(patch.labels);
    if (patch.sessionId !== undefined) set['sessionId'] = patch.sessionId;
    if (patch.order !== undefined) set['order'] = patch.order;
    if (Object.keys(set).length > 0) {
      await this.db.update(tasksTable).set(set).where(eq(tasksTable.id, id));
    }
  }

  async delete(id: ProjectTaskId): Promise<void> {
    await this.db.delete(tasksTable).where(eq(tasksTable.id, id));
  }

  private async nextOrder(projectId: ProjectId): Promise<string> {
    // Ordenação fracional precisa do MAIOR order existente para
    // posicionar a nova task no FINAL. `asc` retornava o menor e
    // `generateOrder(menor, null)` empilhava todas as novas logo acima da
    // primeira task (board ficava com inserts em loop no topo).
    const rows = await this.db
      .select({ order: tasksTable.order })
      .from(tasksTable)
      .where(eq(tasksTable.projectId, projectId))
      .orderBy(desc(tasksTable.order))
      .limit(1);
    const last = rows[0]?.order ?? null;
    return generateOrder(last, null);
  }
}

function generateOrder(after: string | null, before: string | null): string {
  if (!after && !before) return 'n';
  if (!after) return String.fromCharCode((before ?? 'n').charCodeAt(0) - 1);
  if (!before) {
    const code = after.charCodeAt(after.length - 1);
    return after.slice(0, -1) + String.fromCharCode(code + 1);
  }
  const mid = Math.floor((after.charCodeAt(0) + before.charCodeAt(0)) / 2);
  return String.fromCharCode(mid);
}

function rowToTask(row: ProjectTaskRow): ProjectTask {
  let labels: string[] = [];
  try {
    labels = JSON.parse(row.labels) as string[];
  } catch {
    labels = [];
  }
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    status: row.status,
    ...(row.priority ? { priority: row.priority } : {}),
    ...(row.assigneeId ? { assigneeId: row.assigneeId } : {}),
    ...(row.dueAt ? { dueAt: row.dueAt } : {}),
    labels,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    order: row.order,
    createdAt: row.createdAt,
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
  };
}
