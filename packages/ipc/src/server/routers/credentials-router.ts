import { z } from 'zod';
import type { CredentialSetOptions } from '../context.ts';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const CredentialKeySchema = z.string().min(1).max(200);
const CredentialSetOptionsSchema = z
  .object({
    expiresAt: z.number().int().positive().optional(),
    tags: z.array(z.string()).optional(),
  })
  .optional();

const CredentialMetaSchema = z.object({
  key: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  expiresAt: z.number().optional(),
  tags: z.array(z.string()).readonly(),
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

  set: authed
    .input(
      z.object({
        key: CredentialKeySchema,
        value: z.string(),
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

  rotate: authed
    .input(z.object({ key: CredentialKeySchema, newValue: z.string() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.credentials.rotate(input.key, input.newValue);
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
