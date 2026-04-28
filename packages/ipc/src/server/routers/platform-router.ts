import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { OpenDialogOptions, SaveDialogOptions } from '../context.ts';
import { procedure, router } from '../trpc.ts';

const FilterSchema = z.object({
  name: z.string(),
  extensions: z.array(z.string()),
});

const SaveDialogInputSchema = z.object({
  defaultPath: z.string().optional(),
  filters: z.array(FilterSchema).optional(),
  title: z.string().optional(),
});

const OpenDialogInputSchema = z.object({
  defaultPath: z.string().optional(),
  filters: z.array(FilterSchema).optional(),
  title: z.string().optional(),
});

const SaveDialogOutputSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().optional(),
});

const OpenDialogOutputSchema = z.object({
  canceled: z.boolean(),
  filePaths: z.array(z.string()),
});

const AppInfoOutputSchema = z.object({
  version: z.string(),
  platform: z.string(),
  isPackaged: z.boolean(),
  electronVersion: z.string(),
  nodeVersion: z.string(),
});

export const platformRouter = router({
  getAppInfo: procedure
    .input(z.void())
    .output(AppInfoOutputSchema)
    .query(({ ctx }) => {
      const handler = ctx.platform?.getAppInfo;
      if (!handler) {
        return {
          version: '0.0.0',
          platform: 'unknown',
          isPackaged: false,
          electronVersion: '',
          nodeVersion: '',
        };
      }
      return handler();
    }),
  readFileAsDataUrl: procedure
    .input(z.object({ path: z.string() }))
    .output(z.string())
    .query(async ({ input, ctx }) => {
      const shell = ctx.platform?.readFileAsDataUrl;
      if (!shell) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'platform readFileAsDataUrl unavailable for this build flavor',
        });
      }
      return await shell(input.path);
    }),

  openExternal: procedure
    .input(z.object({ url: z.url() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const handler = ctx.platform?.openExternal;
      if (!handler) {
        // Sem handler de plataforma → caller deve mostrar erro/toast em vez
        // de assumir sucesso silencioso. Antes era no-op e o usuário ficava
        // sem feedback de "abrir link" que não fazia nada.
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'platform openExternal unavailable for this build flavor',
        });
      }
      await handler(input.url);
    }),

  copyToClipboard: procedure
    .input(z.object({ text: z.string() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      await ctx.platform?.copyToClipboard?.(input.text);
    }),

  showItemInFolder: procedure
    .input(z.object({ path: z.string() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      await ctx.platform?.showItemInFolder?.(input.path);
    }),

  showSaveDialog: procedure
    .input(SaveDialogInputSchema)
    .output(SaveDialogOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const handler = ctx.platform?.showSaveDialog;
      if (!handler) return { canceled: true };
      const options: SaveDialogOptions = {
        ...(input.defaultPath !== undefined && { defaultPath: input.defaultPath }),
        ...(input.filters !== undefined && { filters: input.filters }),
        ...(input.title !== undefined && { title: input.title }),
      };
      const result = await handler(options);
      return {
        canceled: result.canceled,
        ...(result.filePath !== undefined && { filePath: result.filePath }),
      };
    }),

  showOpenDialog: procedure
    .input(OpenDialogInputSchema)
    .output(OpenDialogOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const handler = ctx.platform?.showOpenDialog;
      if (!handler) return { canceled: true, filePaths: [] };
      const options: OpenDialogOptions = {
        ...(input.defaultPath !== undefined && { defaultPath: input.defaultPath }),
        ...(input.filters !== undefined && { filters: input.filters }),
        ...(input.title !== undefined && { title: input.title }),
      };
      const result = await handler(options);
      return { canceled: result.canceled, filePaths: [...result.filePaths] };
    }),
});
