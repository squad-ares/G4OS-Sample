import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const TranscribeInput = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

const TranscribeOutput = z.object({
  text: z.string(),
});

export const voiceRouter = router({
  transcribe: authed
    .input(TranscribeInput)
    .output(TranscribeOutput)
    .mutation(async ({ input, ctx }) => {
      // `Buffer.from` throwa `TypeError` em base64 inválido. Sem try,
      // erro vira TRPCError genérico em vez de BAD_REQUEST estruturado.
      let buf: Buffer;
      try {
        buf = Buffer.from(input.audioBase64, 'base64');
      } catch (cause) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'invalid base64 audio',
          cause,
        });
      }
      const result = await ctx.voice.transcribe(buf, input.mimeType);
      if (result.isErr()) throw result.error;
      return { text: result.value };
    }),
});
