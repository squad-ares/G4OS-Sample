import { z } from 'zod';
import { AttachmentSchema } from './attachment.schema.ts';

// Roles explicit como union discriminada
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

// Content blocks — toda mensagem e lista de blocos tipados
export const TextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const ToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  toolUseId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
});

export const ToolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  toolUseId: z.string(),
  content: z.union([z.string(), z.array(TextBlockSchema)]),
  isError: z.boolean().default(false),
});

export const ThinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  text: z.string(),
});

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
  ThinkingBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// Mensagem
export const MessageIdSchema = z.uuid();

export const MessageSchema = z.object({
  id: MessageIdSchema,
  sessionId: z.uuid(),
  role: MessageRoleSchema,
  content: z.array(ContentBlockSchema),
  attachments: z.array(AttachmentSchema).default([]),

  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),

  // Autor identificado (para colaboração)
  author: z
    .object({
      id: z.string(),
      email: z.email().optional(),
      displayName: z.string().optional(),
      provenance: z.enum(['verified', 'ambiguous', 'unknown']),
    })
    .optional(),

  metadata: z
    .object({
      thinkingLevel: z.enum(['low', 'think', 'high', 'ultra']).optional(),
      modelId: z.string().optional(),
      usage: z
        .object({
          inputTokens: z.number().int().nonnegative(),
          outputTokens: z.number().int().nonnegative(),
          cacheReadTokens: z.number().int().nonnegative().optional(),
          cacheWriteTokens: z.number().int().nonnegative().optional(),
        })
        .optional(),
      durationMs: z.number().int().nonnegative().optional(),
      // CR-24 F-CR24-1: discriminador para mensagens role='system'.
      // V1 tinha 4 roles dedicados (`error`/`info`/`warning`/`system`); V2
      // unifica em role='system' + `systemKind` para preservar o shape
      // do V1 SystemMessage (variantes visuais) sem inflar a enum de role.
      // Quando ausente, o renderer trata como `system` neutro.
      systemKind: z.enum(['error', 'info', 'warning']).optional(),
      // Código de erro do AgentError ou do AppError que originou a falha.
      // Persistido só em system messages com `systemKind: 'error'` para
      // permitir Settings/Repair filtrar histórico por code (`agent.invalid_api_key`,
      // `agent.rate_limited`, etc.) e renderer diferenciar UX por categoria.
      errorCode: z.string().optional(),
    })
    .default({}),
});

export type Message = z.infer<typeof MessageSchema>;
export type MessageId = Message['id'];

export const MessageAppendResultSchema = z.object({
  message: MessageSchema,
  sequenceNumber: z.number().int().nonnegative(),
});
export type MessageAppendResult = z.infer<typeof MessageAppendResultSchema>;
