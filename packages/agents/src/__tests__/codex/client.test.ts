import { describe, expect, it } from 'vitest';
import { AppServerClient } from '../../codex/app-server/client.ts';
import type { CodexResponseEvent } from '../../codex/app-server/protocol.ts';
import type {
  Subprocess,
  SubprocessExit,
  SubprocessSpawner,
} from '../../codex/app-server/subprocess.ts';

class FakeSubprocess implements Subprocess {
  readonly writes: string[] = [];
  killed = false;
  private readonly stdoutQueue: string[] = [];
  private readonly stdoutWaiters: Array<(value: IteratorResult<string>) => void> = [];
  private done = false;
  private resolveExit!: (value: SubprocessExit) => void;
  readonly exit: Promise<SubprocessExit> = new Promise((resolve) => {
    this.resolveExit = resolve;
  });

  readonly stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () => this.nextStdout(),
    }),
  };

  write(chunk: string): Promise<void> {
    this.writes.push(chunk);
    return Promise.resolve();
  }

  kill(): void {
    this.killed = true;
    this.finish();
    this.resolveExit({ code: null, signal: 'SIGTERM' });
  }

  emitChunk(chunk: string): void {
    if (this.stdoutWaiters.length > 0) {
      const waiter = this.stdoutWaiters.shift();
      waiter?.({ value: chunk, done: false });
      return;
    }
    this.stdoutQueue.push(chunk);
  }

  finish(): void {
    this.done = true;
    while (this.stdoutWaiters.length > 0) {
      const waiter = this.stdoutWaiters.shift();
      waiter?.({ value: undefined as unknown as string, done: true });
    }
  }

  private nextStdout(): Promise<IteratorResult<string>> {
    if (this.stdoutQueue.length > 0) {
      const value = this.stdoutQueue.shift() as string;
      return Promise.resolve({ value, done: false });
    }
    if (this.done) {
      return Promise.resolve({ value: undefined as unknown as string, done: true });
    }
    return new Promise((resolve) => this.stdoutWaiters.push(resolve));
  }
}

class FakeSpawner implements SubprocessSpawner {
  readonly kind = 'fake' as const;
  readonly children: FakeSubprocess[] = [];
  readonly calls: Array<{ command: string; args: readonly string[] }> = [];

  spawn(command: string, args: readonly string[]): Subprocess {
    const child = new FakeSubprocess();
    this.calls.push({ command, args: [...args] });
    this.children.push(child);
    return child;
  }
}

function makeClient() {
  const spawner = new FakeSpawner();
  const client = new AppServerClient({ command: '/bin/codex', spawner });
  client.start();
  const subprocess = spawner.children[0];
  if (!subprocess) throw new Error('spawn did not run');
  return { client, spawner, subprocess };
}

describe('AppServerClient', () => {
  it('spawns with default [app-server] args and buffers stdin writes', async () => {
    const { client, spawner, subprocess } = makeClient();
    expect(spawner.calls[0]).toEqual({ command: '/bin/codex', args: ['app-server'] });
    await client.send({ type: 'handshake', requestId: 'h-1', protocolVersion: 1 });
    expect(subprocess.writes).toHaveLength(1);
    expect(subprocess.writes[0]?.endsWith('\n')).toBe(true);
    client.dispose();
  });

  it('parses NDJSON lines across chunks and forwards to listeners', async () => {
    const { client, subprocess } = makeClient();
    const received: CodexResponseEvent[] = [];
    client.on('message', (ev) => received.push(ev));
    subprocess.emitChunk('{"type":"ack","requestId":"r-1"}\n{"type":"turn_');
    subprocess.emitChunk('started","requestId":"r-1","turnId":"t-1"}\n');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(received).toEqual([
      { type: 'ack', requestId: 'r-1' },
      { type: 'turn_started', requestId: 'r-1', turnId: 't-1' },
    ]);
    client.dispose();
  });

  it('dispose() kills the subprocess', () => {
    const { client, subprocess } = makeClient();
    client.dispose();
    expect(subprocess.killed).toBe(true);
  });

  it('send() rejects before start()', async () => {
    const spawner = new FakeSpawner();
    const client = new AppServerClient({ command: '/bin/codex', spawner });
    await expect(client.send({ type: 'cancel', requestId: 'r-1' })).rejects.toThrow(
      /Agent unavailable: codex/,
    );
  });

  it('exit listener fires when subprocess terminates', async () => {
    const { client, subprocess } = makeClient();
    let observed: { code: number | null; signal: string | null } | undefined;
    client.on('exit', (info) => {
      observed = info;
    });
    subprocess.finish();
    // Signal exit via kill resolving the exit promise
    subprocess.kill();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(observed?.signal).toBe('SIGTERM');
  });
});
