/**
 * Schemas compartilhados para sources (MCP/managed/filesystem/api).
 *
 * `SourceView` é a representação serializável que atravessa IPC — nunca
 * inclui segredos (tokens, api keys ficam no vault por referência).
 * `SourceCatalogItem` descreve entradas do catálogo disponíveis pra enable.
 */

import { z } from 'zod';

export const SourceKindSchema = z.enum(['mcp-stdio', 'mcp-http', 'managed', 'filesystem', 'api']);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceStatusSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'needs_auth',
  'error',
]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const SourceCategorySchema = z.enum([
  'google',
  'microsoft',
  'slack',
  'dev',
  'storage',
  'crm',
  'pm',
  'other',
]);
export type SourceCategory = z.infer<typeof SourceCategorySchema>;

export const SourceAuthKindSchema = z.enum(['none', 'oauth', 'api_key']);
export type SourceAuthKind = z.infer<typeof SourceAuthKindSchema>;

/** Configuração persistida de uma source num workspace. Sem segredos. */
export const SourceConfigViewSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  slug: z.string().min(1).max(100),
  kind: SourceKindSchema,
  displayName: z.string().min(1).max(200),
  category: SourceCategorySchema,
  authKind: SourceAuthKindSchema,
  enabled: z.boolean(),
  status: SourceStatusSchema,
  /**
   * Config específico por kind. Nunca inclui segredos — eles ficam no
   * `CredentialVault` referenciados por `credentialKey` (opcional).
   */
  config: z.record(z.string(), z.unknown()).default({}),
  credentialKey: z.string().optional(),
  iconUrl: z.string().url().optional(),
  description: z.string().max(500).optional(),
  lastError: z.string().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type SourceConfigView = z.infer<typeof SourceConfigViewSchema>;

/** Entrada do catálogo de sources disponíveis pra enable. */
export const SourceCatalogItemSchema = z.object({
  slug: z.string().min(1).max(100),
  kind: SourceKindSchema,
  displayName: z.string().min(1).max(200),
  description: z.string().max(500),
  descriptionKey: z.string().max(200).optional(),
  category: SourceCategorySchema,
  authKind: SourceAuthKindSchema,
  iconUrl: z.string().url().optional(),
  /** Se já existe uma source habilitada com esse slug no workspace. */
  isInstalled: z.boolean(),
});
export type SourceCatalogItem = z.infer<typeof SourceCatalogItemSchema>;

export const SourceIdSchema = z.uuid();
export type SourceId = z.infer<typeof SourceIdSchema>;

/** Input pra enable um item do catálogo managed. */
export const EnableManagedSourceInputSchema = z.object({
  workspaceId: z.uuid(),
  slug: z.string().min(1).max(100),
});
export type EnableManagedSourceInput = z.infer<typeof EnableManagedSourceInputSchema>;

/** Input pra criar source custom de MCP stdio. */
export const CreateMcpStdioSourceInputSchema = z.object({
  workspaceId: z.uuid(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  displayName: z.string().min(1).max(200),
  // Caps em strings para prevenir DoS — paths típicos são 100-300 chars; 8000 cobre casos exóticos.
  command: z.string().min(1).max(8000),
  args: z.array(z.string().max(8000)).max(100).default([]),
  env: z.record(z.string().max(200), z.string().max(8000)).default({}),
  description: z.string().max(500).optional(),
});
export type CreateMcpStdioSourceInput = z.infer<typeof CreateMcpStdioSourceInputSchema>;

/** Input pra criar source custom de MCP HTTP. */
export const CreateMcpHttpSourceInputSchema = z.object({
  workspaceId: z.uuid(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  displayName: z.string().min(1).max(200),
  url: z.string().url(),
  authKind: SourceAuthKindSchema.default('none'),
  headers: z.record(z.string(), z.string()).default({}),
  description: z.string().max(500).optional(),
});
export type CreateMcpHttpSourceInput = z.infer<typeof CreateMcpHttpSourceInputSchema>;

export type CreateSourceInput = CreateMcpStdioSourceInput | CreateMcpHttpSourceInput;

/**
 * Formato do arquivo `sources.json` por workspace.
 * Versionado pra permitir migrações futuras.
 */
export const SourcesFileSchema = z.object({
  version: z.literal(1),
  sources: z.array(SourceConfigViewSchema),
});
export type SourcesFile = z.infer<typeof SourcesFileSchema>;
