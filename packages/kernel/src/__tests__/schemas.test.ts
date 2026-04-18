import { describe, expect, it } from 'vitest';
import { AttachmentSchema } from '../schemas/attachment.schema.ts';
import { SessionEventSchema } from '../schemas/event.schema.ts';
import { PermissionConfigSchema } from '../schemas/permission.schema.ts';
import { SessionSchema } from '../schemas/session.schema.ts';
import { ToolInvocationSchema } from '../schemas/tool.schema.ts';
import { WorkspaceSchema } from '../schemas/workspace.schema.ts';

const now = Date.now();
const uuid = '550e8400-e29b-41d4-a716-446655440000';
const uuid2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

// ─── AttachmentSchema ────────────────────────────────────────────────────────

describe('AttachmentSchema', () => {
  it('parses file attachment', () => {
    const result = AttachmentSchema.parse({
      type: 'file',
      id: uuid,
      name: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      createdAt: now,
      localPath: '/tmp/report.pdf',
    });
    expect(result.type).toBe('file');
  });

  it('parses link attachment', () => {
    const result = AttachmentSchema.parse({
      type: 'link',
      id: uuid,
      name: 'GitHub',
      mimeType: 'text/html',
      sizeBytes: 0,
      createdAt: now,
      url: 'https://github.com',
    });
    expect(result.type).toBe('link');
  });

  it('rejects unknown type', () => {
    expect(() =>
      AttachmentSchema.parse({
        type: 'video',
        id: uuid,
        name: 'x',
        mimeType: 'video/mp4',
        sizeBytes: 0,
        createdAt: now,
      }),
    ).toThrow();
  });
});

// ─── ToolInvocationSchema ────────────────────────────────────────────────────

describe('ToolInvocationSchema', () => {
  it('parses valid tool invocation', () => {
    const result = ToolInvocationSchema.parse({
      id: uuid,
      sessionId: uuid2,
      messageId: uuid,
      toolUseId: 'tu-1',
      toolName: 'read_file',
      input: { path: '/tmp/x' },
      status: 'completed',
      startedAt: now,
    });
    expect(result.isError).toBe(false);
  });

  it('rejects unknown status', () => {
    expect(() =>
      ToolInvocationSchema.parse({
        id: uuid,
        sessionId: uuid2,
        messageId: uuid,
        toolUseId: 'tu-1',
        toolName: 'x',
        input: {},
        status: 'unknown',
        startedAt: now,
      }),
    ).toThrow();
  });
});

// ─── PermissionConfigSchema ──────────────────────────────────────────────────

describe('PermissionConfigSchema', () => {
  it('parses with defaults', () => {
    const result = PermissionConfigSchema.parse({ updatedAt: now });
    expect(result.mode).toBe('ask');
    expect(result.rules).toEqual([]);
  });

  it('parses permission rule with pattern', () => {
    const result = PermissionConfigSchema.parse({
      mode: 'safe',
      updatedAt: now,
      rules: [{ action: 'read_file', decision: 'allow', pattern: '/tmp/**' }],
    });
    expect(result.rules).toHaveLength(1);
  });

  it('rejects unknown mode', () => {
    expect(() => PermissionConfigSchema.parse({ mode: 'root', updatedAt: now })).toThrow();
  });
});

// ─── SessionSchema ───────────────────────────────────────────────────────────

describe('SessionSchema', () => {
  it('parses minimal session', () => {
    const result = SessionSchema.parse({
      id: uuid,
      workspaceId: uuid2,
      name: 'Test session',
      createdAt: now,
      updatedAt: now,
    });
    expect(result.status).toBe('idle');
    expect(result.enabledSourceSlugs).toEqual([]);
    expect(result.metadata.turnCount).toBe(0);
  });

  it('rejects empty name', () => {
    expect(() =>
      SessionSchema.parse({
        id: uuid,
        workspaceId: uuid2,
        name: '',
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });
});

// ─── SessionEventSchema ──────────────────────────────────────────────────────

describe('SessionEventSchema', () => {
  const base = { eventId: uuid, sessionId: uuid2, sequenceNumber: 0, timestamp: now };

  it('parses session.created', () => {
    const result = SessionEventSchema.parse({
      ...base,
      type: 'session.created',
      workspaceId: uuid,
      name: 'Chat',
      createdBy: 'user@example.com',
    });
    expect(result.type).toBe('session.created');
  });

  it('parses session.archived', () => {
    const result = SessionEventSchema.parse({ ...base, type: 'session.archived' });
    expect(result.type).toBe('session.archived');
  });

  it('rejects unknown event type', () => {
    expect(() => SessionEventSchema.parse({ ...base, type: 'unknown.event' })).toThrow();
  });
});

// ─── WorkspaceSchema ─────────────────────────────────────────────────────────

describe('WorkspaceSchema', () => {
  it('parses with nested defaults', () => {
    const result = WorkspaceSchema.parse({
      id: uuid,
      name: 'My Workspace',
      slug: 'my-workspace',
      rootPath: '/home/user/work',
      createdAt: now,
      updatedAt: now,
    });
    expect(result.defaults.permissionMode).toBe('ask');
    expect(result.metadata).toEqual({});
    expect(result.setupCompleted).toBe(false);
  });

  it('rejects invalid slug', () => {
    expect(() =>
      WorkspaceSchema.parse({
        id: uuid,
        name: 'x',
        slug: 'My Workspace!',
        rootPath: '/',
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });
});
