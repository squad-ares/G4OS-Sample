import { z } from 'zod';

/**
 * NewsItem — post publicado pelo viewer em `/api/news`.
 *
 * O viewer V1 expõe o feed como `{ generatedAt, items: [...] }`. Espelhamos
 * só o item para o contrato IPC — a lista fica como array.
 *
 * `markdown` é o conteúdo renderizável (sanitizado pelo renderer no client).
 * `publishDate` é ISO-8601; `sortRank` ordena itens do mesmo dia.
 */
export const NewsItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  markdown: z.string(),
  publishDate: z.string(),
  sortRank: z.number().int(),
  updatedAt: z.string(),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

export const NewsFeedSchema = z.object({
  generatedAt: z.string(),
  items: z.array(NewsItemSchema),
});

export type NewsFeed = z.infer<typeof NewsFeedSchema>;
