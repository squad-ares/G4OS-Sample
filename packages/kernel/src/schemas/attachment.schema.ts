import { z } from 'zod';

export const AttachmentTypeSchema = z.enum(['file', 'image', 'doc', 'link']);
export type AttachmentType = z.infer<typeof AttachmentTypeSchema>;

const BaseAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.number().int().positive(),
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
  url: z.url(),
  previewTitle: z.string().optional(),
  previewDescription: z.string().optional(),
});

export const AttachmentSchema = z.discriminatedUnion('type', [
  FileAttachmentSchema,
  ImageAttachmentSchema,
  DocAttachmentSchema,
  LinkAttachmentSchema,
]);

export type Attachment = z.infer<typeof AttachmentSchema>;
export type AttachmentId = string;
