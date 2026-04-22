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

export const ProjectPatchSchema = ProjectSchema.partial().omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  rootPath: true,
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

export const ProjectTaskPatchSchema = ProjectTaskSchema.partial().omit({
  id: true,
  projectId: true,
  createdAt: true,
});
