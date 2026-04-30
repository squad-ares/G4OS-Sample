import { z } from 'zod';

/**
 * Schema canônico para IDs de label. Routers devem importar daqui em vez
 * de redeclarar `z.uuid()` inline.
 */
export const LabelIdSchema = z.uuid();

export const LabelSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  parentId: z.uuid().optional(),
  name: z.string().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/u)
    .optional(),
  treeCode: z.string().min(1).max(400),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export type Label = z.infer<typeof LabelSchema>;
export type LabelId = Label['id'];

export const LabelCreateSchema = LabelSchema.pick({
  workspaceId: true,
  name: true,
  color: true,
  parentId: true,
});

export type LabelCreateInput = z.infer<typeof LabelCreateSchema>;

export const LabelUpdateSchema = z.object({
  id: z.uuid(),
  patch: z.object({
    name: z.string().min(1).max(80).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/u)
      .optional(),
    parentId: z.uuid().nullable().optional(),
  }),
});

export type LabelUpdateInput = z.infer<typeof LabelUpdateSchema>;
