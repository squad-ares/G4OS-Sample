import { z } from 'zod';

export const PermissionModeSchema = z.enum(['allow-all', 'ask', 'safe']);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

export const PermissionActionSchema = z.enum([
  'read_file',
  'write_file',
  'delete_file',
  'execute_command',
  'network_request',
  'spawn_process',
  'access_clipboard',
  'access_camera',
  'access_microphone',
]);

export type PermissionAction = z.infer<typeof PermissionActionSchema>;

export const PermissionDecisionSchema = z.enum(['allow', 'deny', 'ask']);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const PermissionRuleSchema = z.object({
  action: PermissionActionSchema,
  decision: PermissionDecisionSchema,
  pattern: z.string().optional(),
  expiresAt: z.number().int().positive().optional(),
});

export type PermissionRule = z.infer<typeof PermissionRuleSchema>;

export const PermissionConfigSchema = z.object({
  mode: PermissionModeSchema.default('ask'),
  rules: z.array(PermissionRuleSchema).default([]),
  updatedAt: z.number().int().positive(),
});

export type PermissionConfig = z.infer<typeof PermissionConfigSchema>;
