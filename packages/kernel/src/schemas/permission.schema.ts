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

/**
 * Decisões persistidas de tool use (`allow_always`). Separado de `PermissionRule`
 * (modelagem estática V1 não-adotada). Chave de match: `(toolName, argsHash)`.
 *
 * CR-42 F-CR42-3: caps adicionados para alinhar com o boundary IPC
 * (`permissions-router.ts`). Sem `.max()`, um `permissions.json` corrompido
 * ou adulterado podia injetar strings de 100MB no memory map do broker.
 * `argsHash` restrito a hex `[a-f0-9]` com comprimento 32 (legacy) ou 64
 * (SHA-256 full) — qualquer outro valor é corrupção e deve ser rejeitado na
 * leitura via `ToolPermissionsFileSchema.parse`.
 */
export const ToolPermissionDecisionSchema = z.object({
  toolName: z.string().min(1).max(256),
  argsHash: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[a-f0-9]+$/)
    .refine((h) => h.length === 32 || h.length === 64, {
      message: 'argsHash deve ter 32 (legacy) ou 64 (SHA-256) caracteres hex',
    }),
  argsPreview: z.string().max(256),
  decidedAt: z.number().int().positive(),
});
export type ToolPermissionDecision = z.infer<typeof ToolPermissionDecisionSchema>;

export const ToolPermissionsFileSchema = z.object({
  version: z.literal(1),
  decisions: z.array(ToolPermissionDecisionSchema),
});
export type ToolPermissionsFile = z.infer<typeof ToolPermissionsFileSchema>;
