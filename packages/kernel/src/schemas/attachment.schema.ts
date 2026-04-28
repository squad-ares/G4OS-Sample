import { z } from 'zod';

export const AttachmentTypeSchema = z.enum(['file', 'image', 'doc', 'link']);
export type AttachmentType = z.infer<typeof AttachmentTypeSchema>;

// CR8-06: caps + sanidade em mimeType e sizeBytes. mimeType bate o pattern
// IANA (`type/subtype` com caracteres aceitos); sem isso, valores como
// `application/x-executable` ou strings arbitrárias passavam.
const MIME_TYPE_RE = /^[a-zA-Z0-9!#$&^_+.-]+\/[a-zA-Z0-9!#$&^_+.-]+(;.*)?$/;

const BaseAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(512),
  mimeType: z.string().min(3).max(255).regex(MIME_TYPE_RE),
  sizeBytes: z.number().int().finite().nonnegative(),
  createdAt: z.number().int().finite().positive(),
});

export const FileAttachmentSchema = BaseAttachmentSchema.extend({
  type: z.literal('file'),
  localPath: z.string(),
});

export const ImageAttachmentSchema = BaseAttachmentSchema.extend({
  type: z.literal('image'),
  localPath: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const DocAttachmentSchema = BaseAttachmentSchema.extend({
  type: z.literal('doc'),
  localPath: z.string(),
  pageCount: z.number().int().positive().optional(),
});

export const LinkAttachmentSchema = BaseAttachmentSchema.extend({
  type: z.literal('link'),
  // CR8-06: cap em url para evitar payloads gigantes via paste.
  url: z.url().max(2048),
  previewTitle: z.string().max(512).optional(),
  previewDescription: z.string().max(2048).optional(),
});

export const AttachmentSchema = z.discriminatedUnion('type', [
  FileAttachmentSchema,
  ImageAttachmentSchema,
  DocAttachmentSchema,
  LinkAttachmentSchema,
]);

export type Attachment = z.infer<typeof AttachmentSchema>;
export type AttachmentId = string;
