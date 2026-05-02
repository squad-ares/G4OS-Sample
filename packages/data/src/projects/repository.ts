import type {
  Project,
  ProjectCreateInput,
  ProjectId,
  ProjectPatch,
  WorkspaceId,
} from '@g4os/kernel/types';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { AppDb } from '../drizzle.ts';
import { projects as projectsTable } from '../schema/index.ts';
import type { ProjectRow } from '../schema/projects.ts';

export class ProjectsRepository {
  constructor(private readonly db: AppDb) {}

  async list(workspaceId: WorkspaceId): Promise<readonly Project[]> {
    const rows = await this.db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.workspaceId, workspaceId), eq(projectsTable.status, 'active')))
      .orderBy(desc(projectsTable.updatedAt));
    return rows.map(rowToProject);
  }

  async listAll(workspaceId: WorkspaceId): Promise<readonly Project[]> {
    const rows = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.workspaceId, workspaceId))
      .orderBy(asc(projectsTable.name));
    return rows.map(rowToProject);
  }

  async get(id: ProjectId): Promise<Project | null> {
    const rows = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);
    const row = rows[0];
    return row ? rowToProject(row) : null;
  }

  /**
   * Pré-check de slug duplicado por workspace. Substitui o catch
   * de "UNIQUE constraint failed" que vinha como erro raw SQLite — service
   * agora consegue mapear para `PROJECT_SLUG_CONFLICT` antes do insert.
   * Returns o id do project conflitante ou null.
   */
  async findBySlug(workspaceId: WorkspaceId, slug: string): Promise<ProjectId | null> {
    const rows = await this.db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(eq(projectsTable.workspaceId, workspaceId), eq(projectsTable.slug, slug)))
      .limit(1);
    const row = rows[0];
    return row ? (row.id as ProjectId) : null;
  }

  async create(input: ProjectCreateInput & { rootPath: string }): Promise<Project> {
    const id = crypto.randomUUID();
    const slug = toSlug(input.name);
    const now = Date.now();
    await this.db.insert(projectsTable).values({
      id,
      workspaceId: input.workspaceId,
      name: input.name,
      slug,
      ...(input.description ? { description: input.description } : {}),
      rootPath: input.rootPath,
      status: 'active',
      ...(input.color ? { color: input.color } : {}),
      createdAt: now,
      updatedAt: now,
    });
    const created = await this.get(id);
    if (!created) throw new Error('inserted project not found');
    return created;
  }

  async update(id: ProjectId, patch: ProjectPatch): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.name !== undefined) {
      set['name'] = patch.name;
      set['slug'] = toSlug(patch.name);
    }
    if (patch.description !== undefined) set['description'] = patch.description;
    if (patch.color !== undefined) set['color'] = patch.color;
    if (patch.status !== undefined) set['status'] = patch.status;
    await this.db.update(projectsTable).set(set).where(eq(projectsTable.id, id));
  }

  async archive(id: ProjectId): Promise<void> {
    await this.db
      .update(projectsTable)
      .set({ status: 'archived', updatedAt: Date.now() })
      .where(eq(projectsTable.id, id));
  }

  async restore(id: ProjectId): Promise<void> {
    await this.db
      .update(projectsTable)
      .set({ status: 'active', updatedAt: Date.now() })
      .where(eq(projectsTable.id, id));
  }

  async hardDelete(id: ProjectId): Promise<void> {
    await this.db.delete(projectsTable).where(eq(projectsTable.id, id));
  }

  async registerLegacy(input: {
    readonly id?: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly slug: string;
    readonly description?: string;
    readonly rootPath: string;
  }): Promise<Project> {
    const id = input.id ?? crypto.randomUUID();
    const now = Date.now();
    await this.db.insert(projectsTable).values({
      id,
      workspaceId: input.workspaceId,
      name: input.name,
      slug: input.slug,
      ...(input.description ? { description: input.description } : {}),
      rootPath: input.rootPath,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const created = await this.get(id);
    if (!created) throw new Error(`legacy project insert failed: ${id}`);
    return created;
  }
}

export function toProjectSlug(name: string): string {
  return toSlug(name);
}

function toSlug(name: string): string {
  // CR-23 F-CR23-6b: trim de trailing dash APLICADO TAMBÉM após o slice.
  // Trim inicial cobre o caso de input já terminando em separador; o trim
  // pós-slice pega o caso de slice(0, 80) cortar exatamente num `-` (slug
  // entre segmentos), produzindo trailing dash em URL.
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    ...(row.description ? { description: row.description } : {}),
    rootPath: row.rootPath,
    status: row.status,
    ...(row.color ? { color: row.color } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
