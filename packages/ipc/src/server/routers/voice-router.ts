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
      const buf = Buffer.from(input.audioBase64, 'base64');
      const text = await ctx.voice.transcribe(buf, input.mimeType);
      return { text };
    }),
});
