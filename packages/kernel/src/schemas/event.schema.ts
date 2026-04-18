import { z } from 'zod';
import { MessageSchema } from './message.schema.ts';

const BaseEventSchema = z.object({
  eventId: z.uuid(),
  sessionId: z.uuid(),
  sequenceNumber: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(),
});

export const SessionEventSchema = z.discriminatedUnion('type', [
  BaseEventSchema.extend({
    type: z.literal('session.created'),
    workspaceId: z.uuid(),
    name: z.string(),
    createdBy: z.email(),
  }),
  BaseEventSchema.extend({
    type: z.literal('message.added'),
    message: MessageSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal('message.updated'),
    messageId: z.uuid(),
    patch: z.record(z.string(), z.unknown()),
  }),
  BaseEventSchema.extend({
    type: z.literal('session.renamed'),
    newName: z.string(),
  }),
  BaseEventSchema.extend({
    type: z.literal('session.labeled'),
    labels: z.array(z.string()),
  }),
  BaseEventSchema.extend({
    type: z.literal('session.flagged'),
    reason: z.string().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal('session.archived'),
  }),
  BaseEventSchema.extend({
    type: z.literal('session.deleted'),
  }),
  BaseEventSchema.extend({
    type: z.literal('tool.invoked'),
    toolUseId: z.string(),
    toolName: z.string(),
  }),
  BaseEventSchema.extend({
    type: z.literal('tool.completed'),
    toolUseId: z.string(),
    result: z.unknown(),
    isError: z.boolean(),
  }),
]);

export type SessionEvent = z.infer<typeof SessionEventSchema>;
