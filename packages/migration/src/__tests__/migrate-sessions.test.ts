import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepContext, V2SessionMetadata, V2SessionWriter } from '../steps/contract.ts';
import { migrateSessions } from '../steps/migrate-sessions.ts';
import type { MigrationStep } from '../types.ts';

describe('migrateSessions', () => {
  let v1Path: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `g4os-sess-test-${Date.now()}-${Math.random()}`);
    v1Path = join(base, 'v1');
    await mkdir(v1Path, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(v1Path, '..'), { recursive: true, force: true }).catch(() => undefined);
  });

  function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
    const step: MigrationStep = {
      kind: 'sessions',
      description: 'Sessions',
      count: 0,
      estimatedBytes: 0,
    };
    return {
      sourcePath: v1Path,
      targetPath: join(v1Path, '..', 'v2'),
      step,
      stepIndex: 0,
      stepCount: 1,
      onProgress: vi.fn(),
      dryRun: false,
      options: {},
      ...overrides,
    };
  }

  async function writeSession(opts: {
    workspaceId: string;
    sessionId: string;
    meta: object;
    events: object[];
  }): Promise<void> {
    const dir = join(v1Path, 'workspaces', opts.workspaceId, 'sessions', opts.sessionId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'session.json'), JSON.stringify(opts.meta));
    await writeFile(
      join(dir, 'session.jsonl'),
      `${opts.events.map((e) => JSON.stringify(e)).join('\n')}\n`,
    );
  }

  it('returns empty when V1 has no workspaces dir', async () => {
    const result = await migrateSessions(makeCtx());
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsMigrated).toBe(0);
  });

  it('counts sessions in read-only mode (no writer)', async () => {
    const wid = randomUUID();
    await writeSession({
      workspaceId: wid,
      sessionId: randomUUID(),
      meta: { name: 'sess A', createdAt: 1700000000000 },
      events: [],
    });
    await writeSession({
      workspaceId: wid,
      sessionId: randomUUID(),
      meta: { name: 'sess B', createdAt: 1700000001000 },
      events: [],
    });

    const result = await migrateSessions(makeCtx());
    expect(result.isOk() && result.value.itemsMigrated).toBe(2);
  });

  it('skips sessions without session.json', async () => {
    const wid = randomUUID();
    const sid = randomUUID();
    await mkdir(join(v1Path, 'workspaces', wid, 'sessions', sid), { recursive: true });
    // sem session.json

    const result = await migrateSessions(makeCtx());
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(
      result.isOk() &&
        result.value.nonFatalWarnings.some((w) => w.includes('session.json ausente')),
    ).toBe(true);
  });

  it('writes session via writer when provided', async () => {
    const wid = randomUUID();
    const sid = randomUUID();
    await writeSession({
      workspaceId: wid,
      sessionId: sid,
      meta: { id: sid, workspaceId: wid, name: 'My session', createdAt: 1700000000000 },
      events: [],
    });

    const created: V2SessionMetadata[] = [];
    const writer: V2SessionWriter = {
      existsSession: () => Promise.resolve(false),
      createSession: (m) => {
        created.push(m);
        return Promise.resolve();
      },
      appendEvent: vi.fn(() => Promise.resolve()),
    };
    const result = await migrateSessions(makeCtx({ options: { sessionWriter: writer } }));
    expect(result.isOk()).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]?.id).toBe(sid);
    expect(created[0]?.name).toBe('My session');
  });

  it('skips sessions already in V2 (idempotent)', async () => {
    const wid = randomUUID();
    const sid = randomUUID();
    await writeSession({
      workspaceId: wid,
      sessionId: sid,
      meta: { id: sid, workspaceId: wid, createdAt: 1700000000000 },
      events: [],
    });

    const writer: V2SessionWriter = {
      existsSession: () => Promise.resolve(true),
      createSession: vi.fn(() => Promise.resolve()),
      appendEvent: vi.fn(() => Promise.resolve()),
    };
    const result = await migrateSessions(makeCtx({ options: { sessionWriter: writer } }));
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(writer.createSession).not.toHaveBeenCalled();
  });

  it('maps known V1 events and skips unknown', async () => {
    const wid = randomUUID();
    const sid = randomUUID();
    const validMessageEvent = {
      type: 'message.added',
      message: {
        id: randomUUID(),
        sessionId: sid,
        role: 'user',
        content: [{ type: 'text', text: 'hi' }],
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
    };
    await writeSession({
      workspaceId: wid,
      sessionId: sid,
      meta: { id: sid, workspaceId: wid, createdAt: 1700000000000 },
      events: [validMessageEvent, { type: 'unknown.event', payload: {} }],
    });

    const appended: unknown[] = [];
    const writer: V2SessionWriter = {
      existsSession: () => Promise.resolve(false),
      createSession: () => Promise.resolve(),
      appendEvent: (_sid, ev) => {
        appended.push(ev);
        return Promise.resolve();
      },
    };
    const result = await migrateSessions(makeCtx({ options: { sessionWriter: writer } }));
    expect(result.isOk()).toBe(true);
    expect(appended).toHaveLength(1); // só o message.added passa
    expect(
      result.isOk() && result.value.nonFatalWarnings.some((w) => w.includes('não mapeável')),
    ).toBe(true);
  });

  // F-CR40-1 (regressão): V1 com sequências irregulares [3,0,1,7,2] deve
  // ser passada ao writer sem o sequenceNumber original — writer é responsável
  // por strip+recompute (ADR-0043). Migrator NÃO reordena nem valida gaps.
  it('F-CR40-1: passa eventos com sequenceNumber V1 irregular ao writer sem rejeitar', async () => {
    const wid = randomUUID();
    const sid = randomUUID();
    // V1 JSONL com sequências fora de ordem e com gaps.
    const events = [3, 0, 1, 7, 2].map((seq) => ({
      type: 'message.added',
      sequenceNumber: seq,
      message: {
        id: randomUUID(),
        sessionId: sid,
        role: 'user',
        content: [{ type: 'text', text: `msg seq=${seq}` }],
        createdAt: 1700000000000 + seq,
        updatedAt: 1700000000000 + seq,
      },
    }));

    await writeSession({
      workspaceId: wid,
      sessionId: sid,
      meta: { id: sid, workspaceId: wid, createdAt: 1700000000000 },
      events,
    });

    const appended: unknown[] = [];
    const writer: V2SessionWriter = {
      existsSession: () => Promise.resolve(false),
      createSession: () => Promise.resolve(),
      appendEvent: (_sid, ev) => {
        appended.push(ev);
        return Promise.resolve();
      },
    };
    const result = await migrateSessions(makeCtx({ options: { sessionWriter: writer } }));
    expect(result.isOk()).toBe(true);
    // Todos os 5 eventos chegam ao writer (com sequenceNumber original do V1 —
    // o writer é quem deve fazer strip+recompute conforme ADR-0043).
    expect(appended).toHaveLength(5);
    // Sem warnings de "não mapeável" (todos são message.added válidos).
    expect(
      result.isOk() && result.value.nonFatalWarnings.some((w) => w.includes('não mapeável')),
    ).toBe(false);
  });

  // F-CR40-10: appendEvent falha = sessão marcada como skipped (não migrated).
  it('F-CR40-10: appendEvent error marca sessão como skipped com warning', async () => {
    const wid = randomUUID();
    const sid = randomUUID();
    const validEvent = {
      type: 'message.added',
      message: {
        id: randomUUID(),
        sessionId: sid,
        role: 'user',
        content: [{ type: 'text', text: 'hi' }],
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
    };
    await writeSession({
      workspaceId: wid,
      sessionId: sid,
      meta: { id: sid, workspaceId: wid, createdAt: 1700000000000 },
      events: [validEvent],
    });

    const writer: V2SessionWriter = {
      existsSession: () => Promise.resolve(false),
      createSession: () => Promise.resolve(),
      appendEvent: () => Promise.reject(new Error('disk full')),
    };
    const result = await migrateSessions(makeCtx({ options: { sessionWriter: writer } }));
    expect(result.isOk()).toBe(true);
    // Sessão NÃO foi contada como migrada (appendFailed).
    expect(result.isOk() && result.value.itemsMigrated).toBe(0);
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(
      result.isOk() && result.value.nonFatalWarnings.some((w) => w.includes('appendEvent falhou')),
    ).toBe(true);
  });

  // F-CR40-14: fixture roundtrip V1-0.1 — migrate sem writer conta corretamente.
  it('F-CR40-14: roundtrip com fixture V1-0.1 (read-only)', async () => {
    const wid = randomUUID();
    const sid = randomUUID();
    // Simula fixture V1 0.1.0 — sem campos modernos (provider/modelId).
    await writeSession({
      workspaceId: wid,
      sessionId: sid,
      meta: { version: '0.1.0', name: 'Sessão legacy' },
      events: [
        {
          type: 'session.created',
          timestamp: 1700000000000,
        },
        {
          type: 'message.added',
          message: {
            id: randomUUID(),
            sessionId: sid,
            role: 'user',
            content: [{ type: 'text', text: 'oi' }],
            createdAt: 1700000001000,
            updatedAt: 1700000001000,
          },
        },
      ],
    });

    // Read-only (sem writer): deve contar 1 sessão migrada.
    const result = await migrateSessions(makeCtx());
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsMigrated).toBe(1);
    expect(result.isOk() && result.value.itemsSkipped).toBe(0);
  });
});
