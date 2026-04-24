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

const TurnStreamBase = z.object({ sessionId: z.uuid(), turnId: z.string() });

export const TurnStreamEventSchema = z.discriminatedUnion('type', [
  TurnStreamBase.extend({ type: z.literal('turn.started') }),
  TurnStreamBase.extend({ type: z.literal('turn.text_chunk'), text: z.string() }),
  TurnStreamBase.extend({ type: z.literal('turn.thinking_chunk'), text: z.string() }),
  TurnStreamBase.extend({
    type: z.literal('turn.done'),
    reason: z.enum(['stop', 'max_tokens', 'tool_use', 'interrupted', 'error']),
  }),
  TurnStreamBase.extend({ type: z.literal('turn.error'), code: z.string(), message: z.string() }),
  TurnStreamBase.extend({
    type: z.literal('turn.permission_required'),
    requestId: z.uuid(),
    toolUseId: z.string(),
    toolName: z.string(),
    inputJson: z.string(),
  }),
  TurnStreamBase.extend({
    type: z.literal('turn.tool_use_started'),
    toolUseId: z.string(),
    toolName: z.string(),
    inputJson: z.string(),
  }),
  TurnStreamBase.extend({
    type: z.literal('turn.tool_use_completed'),
    toolUseId: z.string(),
    toolName: z.string(),
    ok: z.boolean(),
  }),
]);

export type TurnStreamEvent = z.infer<typeof TurnStreamEventSchema>;

const PERSISTED_SESSION_EVENT_TYPES = new Set<string>([
  'session.created',
  'session.renamed',
  'session.labeled',
  'session.flagged',
  'session.archived',
  'session.deleted',
  'message.added',
  'message.updated',
  'tool.invoked',
  'tool.completed',
]);

const TURN_STREAM_EVENT_TYPES = new Set<string>([
  'turn.started',
  'turn.text_chunk',
  'turn.thinking_chunk',
  'turn.done',
  'turn.error',
  'turn.permission_required',
  'turn.tool_use_started',
  'turn.tool_use_completed',
]);

export function isPersistedSessionEvent(event: { readonly type: string }): event is SessionEvent {
  return PERSISTED_SESSION_EVENT_TYPES.has(event.type);
}

export function isTurnStreamEvent(event: { readonly type: string }): event is TurnStreamEvent {
  return TURN_STREAM_EVENT_TYPES.has(event.type);
}
