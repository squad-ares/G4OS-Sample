import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { probeMcpStdio, type SpawnFn } from '../mcp-stdio/probe.ts';

/**
 * Constrói um ChildProcess falso mínimo: EventEmitter + stdin/stdout/stderr
 * PassThrough. `kill()` é no-op. Respostas são empurradas em `stdout.write`.
 */
function makeFakeChild(): {
  child: ChildProcess;
  stdout: PassThrough;
  stdin: PassThrough;
  emit: (event: string, ...args: unknown[]) => void;
} {
  const ee = new EventEmitter();
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(ee, {
    stdout,
    stdin,
    stderr,
    kill: () => true,
    pid: 12345,
  }) as unknown as ChildProcess;
  return { child, stdout, stdin, emit: (e, ...a) => ee.emit(e, ...a) };
}

describe('probeMcpStdio', () => {
  it('returns "connected" when the child responds with a result to id=1', async () => {
    const fake = makeFakeChild();
    const spawn: SpawnFn = () => fake.child;
    const promise = probeMcpStdio({ command: 'fake', args: [] }, { spawn });
    // Simula resposta MCP bem-sucedida
    fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: {} } })}\n`);
    await expect(promise).resolves.toBe('connected');
  });

  it('returns "needs_auth" when the error message mentions auth', async () => {
    const fake = makeFakeChild();
    const spawn: SpawnFn = () => fake.child;
    const promise = probeMcpStdio({ command: 'fake', args: [] }, { spawn });
    fake.stdout.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'unauthorized' } })}\n`,
    );
    await expect(promise).resolves.toBe('needs_auth');
  });

  it('returns "error" when the child emits a spawn error', async () => {
    const fake = makeFakeChild();
    const spawn: SpawnFn = () => fake.child;
    const promise = probeMcpStdio({ command: 'fake', args: [] }, { spawn });
    fake.emit('error', new Error('ENOENT'));
    await expect(promise).resolves.toBe('error');
  });

  it('returns "error" when the child exits with a non-zero code before responding', async () => {
    const fake = makeFakeChild();
    const spawn: SpawnFn = () => fake.child;
    const promise = probeMcpStdio({ command: 'fake', args: [] }, { spawn });
    fake.emit('exit', 1, null);
    await expect(promise).resolves.toBe('error');
  });

  it('returns "error" when the probe times out without any response', async () => {
    const fake = makeFakeChild();
    const spawn: SpawnFn = () => fake.child;
    const promise = probeMcpStdio({ command: 'fake', args: [], timeoutMs: 10 }, { spawn });
    await expect(promise).resolves.toBe('error');
  });

  it('ignores non-JSON lines and finishes on the first valid response', async () => {
    const fake = makeFakeChild();
    const spawn: SpawnFn = () => fake.child;
    const promise = probeMcpStdio({ command: 'fake', args: [] }, { spawn });
    fake.stdout.write('not-json-debug-line\n');
    fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} })}\n`);
    await expect(promise).resolves.toBe('connected');
  });
});
