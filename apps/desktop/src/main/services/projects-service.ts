import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppDb } from '@g4os/data';
import { ProjectsRepository, ProjectTasksRepository, toProjectSlug } from '@g4os/data/projects';
import { SessionsRepository } from '@g4os/data/sessions';
import type { ProjectsService as ProjectsServiceContract } from '@g4os/ipc/server';
import { AppError, ErrorCode, ProjectError } from '@g4os/kernel/errors';
import { writeAtomic } from '@g4os/kernel/fs';
import { createLogger } from '@g4os/kernel/logger';
import type {
  LegacyImportEntry,
  LegacyProject,
  Project,
  ProjectCreateInput,
  ProjectFile,
  ProjectId,
  ProjectPatch,
  ProjectTask,
  ProjectTaskCreateInput,
  ProjectTaskId,
  ProjectTaskPatch,
  Session,
  WorkspaceId,
} from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import * as fileOps from './projects/file-ops.ts';
import * as legacyImport from './projects/legacy-import.ts';
import { isUniqueConstraintError } from './projects/sqlite-errors.ts';

const log = createLogger('projects-service');

export interface ProjectsServiceDeps {
  readonly drizzle: AppDb;
  readonly workspacesRootPath: string;
}

class SqliteProjectsService implements ProjectsServiceContract {
  readonly #repo: ProjectsRepository;
  readonly #tasks: ProjectTasksRepository;
  readonly #sessions: SessionsRepository;
  readonly #workspacesRootPath: string;

  constructor(deps: ProjectsServiceDeps) {
    this.#repo = new ProjectsRepository(deps.drizzle);
    this.#tasks = new ProjectTasksRepository(deps.drizzle);
    this.#sessions = new SessionsRepository(deps.drizzle);
    this.#workspacesRootPath = deps.workspacesRootPath;
  }

  list(workspaceId: WorkspaceId): Promise<Result<readonly Project[], AppError>> {
    return this.#try('projects.list', () => this.#repo.list(workspaceId));
  }

  listArchived(workspaceId: WorkspaceId): Promise<Result<readonly Project[], AppError>> {
    return this.#try('projects.listArchived', async () => {
      const all = await this.#repo.listAll(workspaceId);
      return all.filter((p) => p.status === 'archived');
    });
  }

  get(id: ProjectId): Promise<Result<Project, AppError>> {
    return this.#try('projects.get', async () => {
      const p = await this.#repo.get(id);
      if (!p) throw notFound(id);
      return p;
    });
  }

  create(input: ProjectCreateInput): Promise<Result<Project, AppError>> {
    return this.#try('projects.create', async () => {
      const slug = toProjectSlug(input.name);
      // Pré-check evita falha tardia + UI tipada via PROJECT_SLUG_CONFLICT.
      // Race condition residual (dois callers simultâneos) é capturada no
      // catch via `isUniqueConstraintError` em `#try`.
      const conflict = await this.#repo.findBySlug(input.workspaceId, slug);
      if (conflict) throw ProjectError.slugConflict(input.workspaceId, slug);
      const rootPath = join(this.#workspacesRootPath, input.workspaceId, 'projects', slug);
      await bootstrapProjectDir(rootPath);
      return this.#repo.create({ ...input, rootPath });
    });
  }

  update(id: ProjectId, patch: ProjectPatch): Promise<Result<void, AppError>> {
    return this.#try('projects.update', async () => {
      // Rename muda slug — pré-check no novo slug.
      if (patch.name !== undefined) {
        const current = await this.#repo.get(id);
        if (!current) throw notFound(id);
        const newSlug = toProjectSlug(patch.name);
        if (newSlug !== current.slug) {
          const conflict = await this.#repo.findBySlug(current.workspaceId, newSlug);
          if (conflict && conflict !== id) {
            throw ProjectError.slugConflict(current.workspaceId, newSlug);
          }
        }
      }
      await this.#repo.update(id, patch);
    });
  }

  archive(id: ProjectId): Promise<Result<void, AppError>> {
    return this.#try('projects.archive', () => this.#repo.archive(id));
  }

  restore(id: ProjectId): Promise<Result<void, AppError>> {
    return this.#try('projects.restore', () => this.#repo.restore(id));
  }

  delete(id: ProjectId): Promise<Result<void, AppError>> {
    return this.#try('projects.delete', () => this.#repo.hardDelete(id));
  }

  listFiles(projectId: ProjectId): Promise<Result<readonly ProjectFile[], AppError>> {
    return this.#try('projects.listFiles', async () => {
      const p = await this.#repo.get(projectId);
      if (!p) throw notFound(projectId);
      return fileOps.listFiles(p.rootPath);
    });
  }

  getFileContent(projectId: ProjectId, relativePath: string): Promise<Result<string, AppError>> {
    return this.#try('projects.getFileContent', async () => {
      const p = await this.#repo.get(projectId);
      if (!p) throw notFound(projectId);
      const result = await fileOps.getFileContent(p.rootPath, relativePath);
      if (result.isErr()) throw result.error;
      return result.value;
    });
  }

  saveFile(
    projectId: ProjectId,
    relativePath: string,
    content: string,
  ): Promise<Result<void, AppError>> {
    return this.#try('projects.saveFile', async () => {
      const p = await this.#repo.get(projectId);
      if (!p) throw notFound(projectId);
      const result = await fileOps.saveFile(p.rootPath, relativePath, content);
      if (result.isErr()) throw result.error;
    });
  }

  deleteFile(projectId: ProjectId, relativePath: string): Promise<Result<void, AppError>> {
    return this.#try('projects.deleteFile', async () => {
      const p = await this.#repo.get(projectId);
      if (!p) throw notFound(projectId);
      const result = await fileOps.deleteFile(p.rootPath, relativePath);
      if (result.isErr()) throw result.error;
    });
  }

  listTasks(projectId: ProjectId): Promise<Result<readonly ProjectTask[], AppError>> {
    return this.#try('projects.listTasks', () => this.#tasks.list(projectId));
  }

  createTask(input: ProjectTaskCreateInput): Promise<Result<ProjectTask, AppError>> {
    return this.#try('projects.createTask', () => this.#tasks.create(input));
  }

  updateTask(id: ProjectTaskId, patch: ProjectTaskPatch): Promise<Result<void, AppError>> {
    return this.#try('projects.updateTask', () => this.#tasks.update(id, patch));
  }

  deleteTask(id: ProjectTaskId): Promise<Result<void, AppError>> {
    return this.#try('projects.deleteTask', () => this.#tasks.delete(id));
  }

  listSessions(projectId: ProjectId): Promise<Result<readonly Session[], AppError>> {
    return this.#try('projects.listSessions', async () => {
      const p = await this.#repo.get(projectId);
      if (!p) throw notFound(projectId);
      return this.#sessions.listByProject(projectId);
    });
  }

  hasLegacyImportDone(workspaceId: WorkspaceId): Promise<Result<boolean, AppError>> {
    return this.#try('projects.hasLegacyImportDone', async () =>
      legacyImport.isDoneMarked(this.#workspacesRootPath, workspaceId),
    );
  }

  discoverLegacyProjects(
    workspaceId: WorkspaceId,
    workingDirectory: string,
  ): Promise<Result<readonly LegacyProject[], AppError>> {
    return this.#try('projects.discoverLegacyProjects', async () => {
      const all = await this.#repo.listAll(workspaceId);
      const registeredPaths = new Set(all.map((p) => p.rootPath));
      const registeredIds = new Set(all.map((p) => p.id));
      const found = await legacyImport.discoverLegacyProjects({
        workspacesRootPath: this.#workspacesRootPath,
        workspaceId,
        workingDirectory,
      });
      return found.filter(
        (p) => !registeredPaths.has(p.path) && !(p.existingId && registeredIds.has(p.existingId)),
      );
    });
  }

  importLegacyProjects(
    workspaceId: WorkspaceId,
    entries: readonly LegacyImportEntry[],
  ): Promise<Result<readonly Project[], AppError>> {
    return this.#try('projects.importLegacyProjects', async () => {
      const canonicalRoot = join(this.#workspacesRootPath, workspaceId, 'projects');
      const imported: Project[] = [];
      for (const entry of entries) {
        const project = await this.#importLegacyEntry(workspaceId, entry, canonicalRoot);
        if (project) imported.push(project);
      }
      await legacyImport.markDone(this.#workspacesRootPath, workspaceId);
      return imported;
    });
  }

  async #importLegacyEntry(
    workspaceId: WorkspaceId,
    entry: LegacyImportEntry,
    canonicalRoot: string,
  ): Promise<Project | null> {
    if (entry.decision === 'skip') return null;
    let rootPath = entry.path;
    if (entry.decision === 'import') {
      const targetPath = join(canonicalRoot, entry.slug);
      const moveResult = await legacyImport.moveLegacyProject(entry.path, targetPath);
      if (moveResult.isErr()) {
        // CR-21: throw o `AppError` direto preserva typed identity quando
        // o `#try` wrapper detecta `instanceof AppError` (line 251) e
        // propaga via `err(error)` em vez de mapear pra `UNKNOWN_ERROR`.
        // Antes, `throw new Error(moveResult.error.message)` strippava
        // `code`/`context`/`cause` e o caller via genérico no renderer.
        throw moveResult.error;
      }
      rootPath = targetPath;
    }
    return this.#repo.registerLegacy({
      ...(entry.existingId ? { id: entry.existingId } : {}),
      workspaceId,
      name: entry.name,
      slug: entry.slug,
      ...(entry.description ? { description: entry.description } : {}),
      rootPath,
    });
  }

  async #try<T>(scope: string, fn: () => Promise<T>): Promise<Result<T, AppError>> {
    try {
      return ok(await fn());
    } catch (error) {
      // Se o caller já lançou um `AppError` tipado (ex.: `notFound`,
      // ou erros propagados de helpers via `Result`), preserva o código
      // original em vez de mascarar como `UNKNOWN_ERROR`.
      if (error instanceof AppError) {
        log.error({ err: error, code: error.code }, `${scope} failed`);
        return err(error);
      }
      // Race entre pré-check e insert — UNIQUE constraint do
      // SQLite vira erro raw. Mapeia para PROJECT_SLUG_CONFLICT quando a
      // coluna afetada é `slug` (ou índice composto incluindo slug).
      const unique = isUniqueConstraintError(error);
      if (unique?.columns.some((c) => c.endsWith('.slug') || c === 'slug')) {
        log.warn({ err: error, columns: unique.columns }, `${scope} slug conflict (race)`);
        return err(
          new AppError({
            code: ErrorCode.PROJECT_SLUG_CONFLICT,
            message: 'project slug already exists in workspace',
            cause: error,
          }),
        );
      }
      log.error({ err: error }, `${scope} failed`);
      return err(
        new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: `${scope} failed`, cause: error }),
      );
    }
  }
}

export function createProjectsService(deps: ProjectsServiceDeps): ProjectsServiceContract {
  return new SqliteProjectsService(deps);
}

async function bootstrapProjectDir(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, 'files'), { recursive: true });
  await mkdir(join(rootPath, 'context'), { recursive: true });
  // CR-33 F-CR33-4: writeAtomic — crash mid-write deixaria `project.json`
  // parcial e o `JSON.parse` subsequente em `list`/`get` falharia. Bootstrap
  // roda na criação do projeto; user veria "criou mas falhou ao abrir" sem
  // repair óbvio. ADR-0050 propagado.
  await writeAtomic(
    join(rootPath, 'project.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), sessionIds: [], tasks: [] }, null, 2),
  );
}

function notFound(id: string): AppError {
  // Usa factory tipada de ProjectError. Antes construía AppError
  // direto, perdendo consistência com SessionError/CredentialError pattern.
  return ProjectError.notFound(id);
}
