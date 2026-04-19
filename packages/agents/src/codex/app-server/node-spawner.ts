import { type ChildProcess, spawn } from 'node:child_process';
import { AgentError } from '@g4os/kernel/errors';
import type { Subprocess, SubprocessExit, SubprocessSpawner } from './subprocess.ts';

export class NodeSubprocessSpawner implements SubprocessSpawner {
  readonly kind = 'node-child_process' as const;

  spawn(command: string, args: readonly string[]): Subprocess {
    const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    return wrapChildProcess(child, command);
  }
}

export function wrapChildProcess(child: ChildProcess, command: string): Subprocess {
  child.stdout?.setEncoding('utf8');
  const exit = new Promise<SubprocessExit>((resolve, reject) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
    child.on('error', (err) => {
      reject(AgentError.network('codex', { reason: 'subprocess error', command, cause: err }));
    });
  });

  const stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => {
      if (!child.stdout) {
        return {
          next: () => Promise.resolve({ value: undefined as unknown as string, done: true }),
        };
      }
      return child.stdout[Symbol.asyncIterator]() as AsyncIterator<string>;
    },
  };

  return {
    stdout,
    exit,
    write: (chunk: string) =>
      new Promise<void>((resolve, reject) => {
        if (!child.stdin || child.stdin.destroyed) {
          reject(AgentError.network('codex', { reason: 'stdin closed' }));
          return;
        }
        child.stdin.write(chunk, (err) => {
          if (err) reject(AgentError.network('codex', { reason: 'stdin write', cause: err }));
          else resolve();
        });
      }),
    kill: (signal) => {
      if (!child.killed) child.kill(signal ?? 'SIGTERM');
    },
  };
}
