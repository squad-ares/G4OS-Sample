import { z } from 'zod';

export const SessionStatusSchema = z.enum(['idle', 'running', 'paused', 'error', 'archived']);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionProviderSchema = z.enum([
  'claude',
  'openai',
  'openai_compat',
  'gemini',
  'bedrock',
  'codex',
]);

export type SessionProvider = z.infer<typeof SessionProviderSchema>;

export const SessionSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string().min(1).max(200),

  status: SessionStatusSchema.default('idle'),
  provider: SessionProviderSchema.optional(),
  modelId: z.string().optional(),

  enabledSourceSlugs: z.array(z.string()).default([]),
  stickyMountedSourceSlugs: z.array(z.string()).default([]),
  rejectedSourceSlugs: z.array(z.string()).default([]),

  labels: z.array(z.string()).default([]),
  projectId: z.uuid().optional(),

  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  lastActivityAt: z.number().int().positive().optional(),

  metadata: z
    .object({
      thinkingLevel: z.enum(['low', 'think', 'high', 'ultra']).optional(),
      titleGeneratedAt: z.number().int().positive().optional(),
      turnCount: z.number().int().nonnegative().default(0),
    })
    .default(() => ({ turnCount: 0 })),
});

export type Session = z.infer<typeof SessionSchema>;
export type SessionId = Session['id'];

export const SessionUpdateSchema = SessionSchema.partial().omit({
  id: true,
  workspaceId: true,
  createdAt: true,
});
