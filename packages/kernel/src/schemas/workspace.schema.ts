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

/**
 * Patch shape for `workspaces.update`. Whitelist explícito de campos
 * user-editáveis.
 *
 * NÃO usar `WorkspaceSchema.partial()` aqui — campos com `.default(...)`
 * (`setupCompleted`, `styleSetupCompleted`, `defaults`, `metadata`) são
 * injetados pelo Zod ao parsear input parcial, clobberando state real
 * no servidor (ex: `setupCompleted: true` vira `false` em qualquer
 * rename pelo UI → usuário volta pra tela de onboarding). Mesma classe
 * de bug que corrigimos em `SessionUpdateSchema` (UNIQUE constraint
 * em messages_index).
 */
export const WorkspaceUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  rootPath: z.string().optional(),
  defaults: z
    .object({
      workingDirectory: z.string().optional(),
      projectsRootPath: z.string().optional(),
      llmConnectionSlug: z.string().optional(),
      permissionMode: z.enum(['allow-all', 'ask', 'safe']).optional(),
    })
    .optional(),
  setupCompleted: z.boolean().optional(),
  styleSetupCompleted: z.boolean().optional(),
  metadata: z
    .object({
      iconId: z.string().optional(),
      theme: z.string().optional(),
      companyContextBound: z.uuid().optional(),
    })
    .optional(),
});

export type WorkspaceUpdate = z.infer<typeof WorkspaceUpdateSchema>;
