import { z } from 'zod';

export const WorkspaceIdSchema = z.uuid();

export const WorkspaceSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  rootPath: z.string(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),

  defaults: z
    .object({
      workingDirectory: z.string().optional(),
      projectsRootPath: z.string().optional(),
      llmConnectionSlug: z.string().optional(),
      permissionMode: z.enum(['allow-all', 'ask', 'safe']).default('ask'),
    })
    .default(() => ({ permissionMode: 'ask' as const })),

  setupCompleted: z.boolean().default(false),
  styleSetupCompleted: z.boolean().default(false),

  metadata: z
    .object({
      iconId: z.string().optional(),
      theme: z.string().optional(),
      companyContextBound: z.uuid().optional(),
    })
    .default({}),
});

export const WorkspaceUpdateSchema = WorkspaceSchema.partial().omit({
  id: true,
  createdAt: true,
});
