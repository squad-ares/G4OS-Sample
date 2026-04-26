import { z } from 'zod';

export const SessionStatusSchema = z.enum(['idle', 'running', 'paused', 'error', 'archived']);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionLifecycleSchema = z.enum(['active', 'archived', 'deleted']);

export type SessionLifecycle = z.infer<typeof SessionLifecycleSchema>;

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
  lifecycle: SessionLifecycleSchema.default('active'),
  provider: SessionProviderSchema.optional(),
  modelId: z.string().optional(),
  workingDirectory: z.string().optional(),

  enabledSourceSlugs: z.array(z.string()).default([]),
  stickyMountedSourceSlugs: z.array(z.string()).default([]),
  rejectedSourceSlugs: z.array(z.string()).default([]),

  labels: z.array(z.string()).default([]),
  projectId: z.uuid().optional(),

  parentId: z.uuid().optional(),
  branchedAtSeq: z.number().int().nonnegative().optional(),

  pinnedAt: z.number().int().positive().optional(),
  starredAt: z.number().int().positive().optional(),
  unread: z.boolean().default(false),

  messageCount: z.number().int().nonnegative().default(0),
  lastMessageAt: z.number().int().positive().optional(),
  lastEventSequence: z.number().int().nonnegative().default(0),

  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  lastActivityAt: z.number().int().positive().optional(),
  archivedAt: z.number().int().positive().optional(),
  deletedAt: z.number().int().positive().optional(),

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

/**
 * Patch shape for `sessions.update`. Whitelist explícito de campos
 * user-editáveis.
 *
 * Não usar `SessionSchema.partial()` aqui: campos com `.default(...)` no
 * SessionSchema (messageCount, lastEventSequence, status, lifecycle,
 * enabled/sticky/rejectedSourceSlugs, unread, metadata) são injetados
 * pelo Zod ao parsear input mesmo quando ausentes — e o repository aplica
 * `if (patch.X !== undefined)`, gravando o default `0`/`[]` por cima do
 * estado event-driven. O sintoma é UNIQUE constraint em messages_index
 * após qualquer update vindo da UI (ex.: model selector, source picker)
 * resetar `lastEventSequence` para 0.
 */
export const SessionUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  provider: SessionProviderSchema.optional(),
  modelId: z.string().optional(),
  workingDirectory: z.string().optional(),
  enabledSourceSlugs: z.array(z.string()).optional(),
  stickyMountedSourceSlugs: z.array(z.string()).optional(),
  rejectedSourceSlugs: z.array(z.string()).optional(),
  unread: z.boolean().optional(),
  projectId: z.uuid().optional(),
  metadata: z
    .object({
      thinkingLevel: z.enum(['low', 'think', 'high', 'ultra']).optional(),
      titleGeneratedAt: z.number().int().positive().optional(),
      turnCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type SessionUpdate = z.infer<typeof SessionUpdateSchema>;

export const SessionFilterSchema = z.object({
  workspaceId: z.uuid(),
  lifecycle: SessionLifecycleSchema.optional(),
  labelIds: z.array(z.uuid()).optional(),
  projectId: z.uuid().optional(),
  pinned: z.boolean().optional(),
  starred: z.boolean().optional(),
  unread: z.boolean().optional(),
  includeBranches: z.boolean().optional(),
  text: z.string().optional(),
  updatedAfter: z.number().int().positive().optional(),
  updatedBefore: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(500).default(50),
  offset: z.number().int().nonnegative().default(0),
});

export type SessionFilter = z.infer<typeof SessionFilterSchema>;
