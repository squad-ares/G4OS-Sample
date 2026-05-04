import { ThinkingLevelSchema, ToolDefinitionSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';

// CR-30 F-CR30-2: `ThinkingLevelSchema` re-exporta do `@g4os/kernel/schemas`
// para preservar API pública dos consumers que importam de
// `@g4os/agents/interface` (validation runtime). Antes existia um clone aqui;
// movido pra kernel como fonte canônica compartilhada com kernel/features/apps.
export { ThinkingLevelSchema };

export const AgentFamilySchema = z.enum([
  'anthropic',
  'openai',
  'openai-compat',
  'google',
  'bedrock',
]);

export const AgentCapabilitiesSchema = z.object({
  family: AgentFamilySchema,
  streaming: z.boolean(),
  thinking: z.boolean(),
  toolUse: z.boolean(),
  promptCaching: z.boolean(),
  maxContextTokens: z.number().int().positive(),
  supportedTools: z.union([z.literal('all'), z.array(z.string().min(1)).readonly()]),
});

export const AgentConfigSchema = z.object({
  connectionSlug: z.string().min(1),
  modelId: z.string().min(1),
  thinkingLevel: ThinkingLevelSchema.optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().optional(),
  tools: z.array(ToolDefinitionSchema).readonly().optional(),
});

export const AgentDoneReasonSchema = z.enum([
  'stop',
  'max_tokens',
  'tool_use',
  'interrupted',
  'error',
]);
