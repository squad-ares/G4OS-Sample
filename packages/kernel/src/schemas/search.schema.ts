import { z } from 'zod';

export const SearchMatchSchema = z.object({
  messageId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  snippet: z.string(),
});

export type SearchMatch = z.infer<typeof SearchMatchSchema>;
