import { z } from 'zod';

export const ToolInvocationStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type ToolInvocationStatus = z.infer<typeof ToolInvocationStatusSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolInvocationSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  messageId: z.uuid(),
  toolUseId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  status: ToolInvocationStatusSchema,
  result: z.unknown().optional(),
  isError: z.boolean().default(false),
  startedAt: z.number().int().positive(),
  completedAt: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;
export type ToolInvocationId = ToolInvocation['id'];
