import { z } from 'zod';

export const UuidSchema = z.uuid();
export const EmailSchema = z.email();
export const UrlSchema = z.url();
export const NonEmptyStringSchema = z.string().min(1);
export const SlugSchema = z.string().regex(/^[a-z0-9-]+$/);

// Timestamps
export const TimestampSchema = z.number().int().positive();
export const IsoDateSchema = z.iso.datetime();

// Paginação
export const PaginationSchema = z.object({
  page: z.number().int().nonnegative().default(0),
  pageSize: z.number().int().positive().max(100).default(20),
});

// Coordenadas geográficas
export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
