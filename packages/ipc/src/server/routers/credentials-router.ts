import { z } from 'zod';
import type { CredentialSetOptions } from '../context.ts';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

// F-CR35-3: alinhado com KEY_MAX_LENGTH=100 e KEY_PATTERN do vault.
// Antes era max(200) — caller passava 150 chars, Zod aceitava, vault
// rejeitava com `invalidKey` em runtime (UX ruim, erro no fundo da pilha).
const CredentialKeySchema = z
  .string()
  .regex(/^[a-z0-9._-]+$/)
  .min(1)
  .max(100);

// F-CR35-4: value e tags alinhados com VALUE_MAX_LENGTH/MAX_TAGS/TAG_MAX_LENGTH
// do vault — payload inválido rejeitado na borda IPC, antes de chegar ao vault.
const CredentialSetOptionsSchema = z
  .object({
    expiresAt: z.number().int().positive().optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
  })
  .optional();

// F-CR35-9: `stale` exposto — vault marca entries com meta corrompida
// como `stale: true`. Sem o campo no schema IPC, a UI nunca recebia o
// sinal e não podia acionar repair manual.
const CredentialMetaSchema = z.object({
  key: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  expiresAt: z.number().optional(),
  tags: z.array(z.string()).readonly(),
  stale: z.boolean().optional(),
});

export const credentialsRouter = router({
  get: authed
    .input(z.object({ key: CredentialKeySchema }))
    .output(z.string())
    .query(async ({ input, ctx }) => {
      const result = await ctx.credentials.get(input.key);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  // F-CR35-4: value alinhado com VALUE_MAX_LENGTH=1_000_000 do vault.
  set: authed
    .input(
      z.object({
        key: CredentialKeySchema,
        value: z.string().min(1).max(1_000_000),
        options: CredentialSetOptionsSchema,
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const options = buildSetOptions(input.options);
      const result = await ctx.credentials.set(input.key, input.value, options);
      if (result.isErr()) throw result.error;
    }),

  delete: authed
    .input(z.object({ key: CredentialKeySchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.credentials.delete(input.key);
      if (result.isErr()) throw result.error;
    }),

  list: authed
    .input(z.void())
    .output(z.array(CredentialMetaSchema).readonly())
    .query(async ({ ctx }) => {
      const result = await ctx.credentials.list();
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  // F-CR35-2: `options` (incluindo `expiresAt`) agora propagado no rotate.
  // Antes o schema não expunha `options`, então caller via tRPC ficava com
  // expiry stale após rotação — próximo scan do RotationOrchestrator
  // re-disparava o handler em loop (bug ADR-0050 reintroduzido na borda IPC).
  rotate: authed
    .input(
      z.object({
        key: CredentialKeySchema,
        newValue: z.string().min(1).max(1_000_000),
        options: CredentialSetOptionsSchema,
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const options = buildSetOptions(input.options);
      const result = await ctx.credentials.rotate(input.key, input.newValue, options);
      if (result.isErr()) throw result.error;
    }),
});

function buildSetOptions(
  input: { expiresAt?: number | undefined; tags?: readonly string[] | undefined } | undefined,
): CredentialSetOptions | undefined {
  if (!input) return undefined;
  const options: { expiresAt?: number; tags?: readonly string[] } = {};
  if (input.expiresAt !== undefined) options.expiresAt = input.expiresAt;
  if (input.tags !== undefined) options.tags = input.tags;
  return options;
}
