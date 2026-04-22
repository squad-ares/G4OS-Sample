import { z } from 'zod';

export const SearchMatchSchema = z.object({
  messageId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  snippet: z.string(),
});

export type SearchMatch = z.infer<typeof SearchMatchSchema>;

/**
 * Match cross-sessão retornado pelo `globalSearch`. Diferente de
 * `SearchMatch` (within-session), traz `sessionId` + `sessionName` para
 * o renderer poder navegar direto ao resultado sem lookup adicional.
 */
export const GlobalSearchHitSchema = z.object({
  sessionId: z.uuid(),
  sessionName: z.string(),
  messageId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  snippet: z.string(),
  updatedAt: z.number().int().positive(),
});

export type GlobalSearchHit = z.infer<typeof GlobalSearchHitSchema>;

export const GlobalSearchResultSchema = z.object({
  messages: z.array(GlobalSearchHitSchema),
  sessions: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      updatedAt: z.number().int().positive(),
    }),
  ),
});

export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>;
