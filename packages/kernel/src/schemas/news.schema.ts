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
// CR8-05: caps em campos vindos de feed externo (viewer público). Sem
// `.max()`/`.datetime()`, um payload malicioso ou bug do server pode injetar
// MB de markdown ou datas inválidas no renderer.
export const NewsItemSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(512),
  markdown: z.string().max(100_000),
  publishDate: z.string().min(1).max(64),
  sortRank: z.number().int().finite(),
  updatedAt: z.string().min(1).max(64),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

export const NewsFeedSchema = z.object({
  generatedAt: z.string(),
  items: z.array(NewsItemSchema),
});

export type NewsFeed = z.infer<typeof NewsFeedSchema>;
