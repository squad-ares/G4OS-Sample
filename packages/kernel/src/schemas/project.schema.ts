import { z } from 'zod';

export const ProjectIdSchema = z.uuid();

export const ProjectStatusSchema = z.enum(['active', 'archived']);

export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  workspaceId: z.uuid(),
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  rootPath: z.string(),
  status: ProjectStatusSchema.default('active'),
  color: z.string().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export const ProjectCreateInputSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  color: z.string().optional(),
});

/**
 * Patch shape para `projects.update`. Whitelist explícito.
 *
 * NÃO usar `ProjectSchema.partial()` — `status.default('active')` é
 * injetado pelo Zod em qualquer rename, clobberando projetos
 * `archived` de volta para `active`. Mesma classe de bug do
 * `SessionUpdateSchema`.
 *
 * CR-22 F-CR22-6: `slug` foi removido do patch porque o `ProjectsRepository.update`
 * só auto-deriva slug a partir de `name` (`toSlug(patch.name)`) — nunca
 * lia `patch.slug`. Schema anterior anunciava o campo mas a impl ignorava
 * silenciosamente; rename via `name` continua mudando o slug do projeto.
 */
export const ProjectPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: ProjectStatusSchema.optional(),
  color: z.string().optional(),
});

export const ProjectTaskStatusSchema = z.enum(['todo', 'in_progress', 'blocked', 'done']);

export const ProjectTaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const ProjectTaskSchema = z.object({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: ProjectTaskStatusSchema.default('todo'),
  priority: ProjectTaskPrioritySchema.optional(),
  assigneeId: z.string().optional(),
  dueAt: z.number().int().positive().optional(),
  labels: z.array(z.string()).default([]),
  sessionId: z.string().optional(),
  order: z.string(),
  createdAt: z.number().int().positive(),
  completedAt: z.number().int().positive().optional(),
});

export const ProjectTaskCreateInputSchema = z.object({
  projectId: ProjectIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: ProjectTaskStatusSchema.optional(),
  priority: ProjectTaskPrioritySchema.optional(),
  assigneeId: z.string().optional(),
  dueAt: z.number().int().positive().optional(),
  labels: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
});

/**
 * Patch shape para `projects.updateTask`. Whitelist explícito.
 *
 * NÃO usar `ProjectTaskSchema.partial()` — `status.default('todo')` e
 * `labels.default([])` são injetados pelo Zod em qualquer edit (ex:
 * trocar título), clobberando tarefas `done` de volta para `todo` e
 * apagando labels. Mesma classe de bug do `SessionUpdateSchema`.
 */
export const ProjectTaskPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: ProjectTaskStatusSchema.optional(),
  priority: ProjectTaskPrioritySchema.optional(),
  assigneeId: z.string().optional(),
  dueAt: z.number().int().positive().optional(),
  labels: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
  order: z.string().optional(),
  completedAt: z.number().int().positive().optional(),
});

export const ProjectFileSchema = z.object({
  relativePath: z.string(),
  size: z.number().int().nonnegative(),
  mtime: z.number().int().positive(),
  mimeType: z.string(),
  canSync: z.boolean(),
});

export const LegacyProjectSchema = z.object({
  path: z.string(),
  name: z.string(),
  slug: z.string(),
  existingId: z.string().optional(),
  description: z.string().optional(),
  inCanonicalRoot: z.boolean(),
});
