import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

// CR-27 F-CR27-5: cap de 10 MiB de string base64 (~7.5 MiB de Buffer).
// Cobre ~12 min de áudio Opus a 64 kbps; sem cap, caller (autenticado ou
// buggy) podia mandar 100 MB+ e exaurir memória em paralelo.
const MAX_AUDIO_BASE64_BYTES = 10 * 1024 * 1024;
// Match estrito de base64 (RFC 4648). Whitespace opcional permitido entre
// chunks — algumas libs fazem chunk com `\n` a cada 76 chars. `=` só pode
// aparecer no fim, no máximo 2 vezes.
const BASE64_PATTERN = /^[A-Za-z0-9+/\s]+={0,2}$/;

const TranscribeInput = z.object({
  audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64_BYTES),
  mimeType: z.string().min(1).max(128),
});

const TranscribeOutput = z.object({
  text: z.string(),
});

export const voiceRouter = router({
  transcribe: authed
    .input(TranscribeInput)
    .output(TranscribeOutput)
    .mutation(async ({ input, ctx }) => {
      // CR-27 F-CR27-5: `Buffer.from(string, 'base64')` em Node NÃO throwa
      // em chars inválidos — ignora silenciosamente. O try/catch original
      // era código morto. Validamos a string ANTES de alocar o Buffer pra
      // dar BAD_REQUEST estruturado em input mal-formado.
      if (!BASE64_PATTERN.test(input.audioBase64)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'invalid base64 audio' });
      }
      const buf = Buffer.from(input.audioBase64, 'base64');
      const result = await ctx.voice.transcribe(buf, input.mimeType);
      if (result.isErr()) throw result.error;
      return { text: result.value };
    }),
});
